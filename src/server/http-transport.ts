import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * The loopback HTTP transport both roomyx servers bind to.
 *
 * It was written twice — once for the per-room server, once for the management
 * server — and the copies had drifted: only one of them closed its sessions on
 * shutdown. Two servers meant every transport-level fix had to be applied
 * twice, and a signed tarball is a poor place to discover that the second one
 * was missed. There is one now.
 *
 * A single `StreamableHTTPServerTransport` only ever completes ONE `initialize`
 * handshake for its whole lifetime — an independent review reproduced this
 * concretely: a second client, even a short-lived liveness check, gets "Server
 * already initialized" and the transport is permanently unusable afterward. So
 * each session (a request with no `mcp-session-id`) gets its own transport and
 * its own `McpServer`, tracked by session id, and later requests carrying that
 * header are routed to the pair that already exists.
 */

export interface McpHttpTransportOptions {
  /** Called once per session. Each session gets its own server instance. */
  createMcpServer: () => McpServer;
  /** Used in the refusal message when a non-loopback host is asked for without acknowledgement. */
  commandLabel: string;
  /** `roomyx serve` uses 4319, `roomyx mcp` 4320 — they must not collide. 0 selects an ephemeral port. */
  defaultPort: number;
  port?: number;
  host?: string;
  acknowledgeNonLoopback?: boolean;
}

export interface McpHttpTransportHandle {
  url: string;
  port: number;
  close(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Refuses non-loopback hosts unless explicitly acknowledged, mirroring `keryx
 * serve`'s convention — same reasoning, recorded as D-06.
 */
export async function serveMcpOverHttp(
  options: McpHttpTransportOptions,
): Promise<McpHttpTransportHandle> {
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host) && !options.acknowledgeNonLoopback) {
    throw new Error(
      `Refusing to bind ${options.commandLabel} to non-loopback host "${host}" without --acknowledge-non-loopback.`,
    );
  }

  /**
   * Live sessions, with the time each was last used.
   *
   * A session used to leave this map only via `onsessionclosed`, which the SDK
   * fires on an HTTP DELETE — and nothing in roomyx sends one. `Client.close()`
   * aborts the local controller; `terminateSession()` is the method that sends
   * the DELETE, and it had no callers. So every session the process ever
   * accepted was retained for the life of the process, at roughly 70-78 KB
   * each, fed by ordinary use: one per `rooms list`, one per `room append`, one
   * per client start, one per reconnect. Each abandoned id also stayed a fully
   * routable handle to the room — three clients closed, then a raw POST
   * replaying their recorded ids still returned a full `tools/list`.
   */
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; lastSeenMs: number }>();

  // Filled in after listen(). Sessions are only ever created while handling a
  // request, so by the time createSession runs this is the real bound port —
  // which matters because the allowlists below cannot be built without it.
  let boundPort = 0;

  async function createSession(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      // Both guards, built lazily, from the port we actually bound.
      //
      // `allowedHosts` is an exact match against the whole `Host` header,
      // port included: a port-less allowlist returns 403 to roomyx's own
      // client. And with `--port 0` the port is not knowable until listen()
      // resolves, so an allowlist written at option-construction time would be
      // wrong by construction.
      //
      // Both lists are required because they stop different attacks. A page at
      // http://127.0.0.1:<port>/mcp sends a legitimate Host, so only
      // `allowedOrigins` refuses it. A DNS-rebound page sends
      // `Host: attacker.example` and, post-rebind, a same-origin Origin — so
      // only `allowedHosts` refuses that one.
      //
      // Nothing legitimate sends an Origin at all: roomyx's own client, the
      // liveness probe and every MCP client are not browsers. The SDK skips
      // the Origin check when the header is absent, so the list below exists
      // to be matched by nothing.
      enableDnsRebindingProtection: true,
      allowedHosts: [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`, `[::1]:${boundPort}`],
      allowedOrigins: [`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`],
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { transport, lastSeenMs: Date.now() });
      },
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
      },
    });
    // The DELETE is one way a session can end; the transport closing for any
    // other reason is another, and only the first was being listened for.
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id !== undefined) sessions.delete(id);
    };
    const mcpServer = options.createMcpServer();
    await mcpServer.connect(transport);
    return transport;
  }

  /**
   * Closes sessions nothing has touched for a while.
   *
   * A well-behaved client polls every second or three, so a minute of silence
   * means it is gone — and the ones that are gone are precisely the ones that
   * never sent the DELETE that would have said so. `unref()` so an idle sweeper
   * cannot be the reason a process stays alive.
   */
  const IDLE_SESSION_MS = 60_000;
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - IDLE_SESSION_MS;
    for (const [id, entry] of sessions) {
      if (entry.lastSeenMs < cutoff) {
        sessions.delete(id);
        void entry.transport.close().catch(() => undefined);
      }
    }
  }, IDLE_SESSION_MS / 2);
  sweeper.unref();

  const httpServer = createHttpServer((req, res) => {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) existing.lastSeenMs = Date.now();

    // A request naming a session that does not exist is answered, not granted a
    // new one. Minting a transport for an unknown id created one that never
    // entered `sessions`, so it could not be closed even by `closeSessions` on
    // shutdown — a leak reachable by anyone sending a random header.
    if (sessionId !== undefined && existing === undefined) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Unknown session ${sessionId}` }));
      return;
    }

    const transportPromise = existing ? Promise.resolve(existing.transport) : createSession();
    transportPromise
      .then((transport) => transport.handleRequest(req, res))
      .catch((error) => {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
        }
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      });
  });

  const port = options.port ?? options.defaultPort;
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, host, () => resolve());
    });
  } catch (error) {
    clearInterval(sweeper);
    await closeSessions(sessions);
    throw error;
  }

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;
  boundPort = actualPort;

  return {
    url: `http://${host}:${actualPort}/mcp`,
    port: actualPort,
    close: async () => {
      // Order matters and it used to be inverted. `httpServer.close()`'s
      // callback fires only once every connection has ended, and the code that
      // ends them — `closeSessions` — was *inside* that callback. An MCP client
      // holds a keep-alive socket, so with anyone attached the callback never
      // fired: `roomyx serve` did not exit on SIGTERM at all, the port stayed
      // bound, and the only way out was SIGKILL. Measured with a control: with
      // a client attached, still running after 12s; with none, clean.
      //
      // The management server used to skip closing sessions entirely, so its
      // sessions outlived the process. One implementation, one behaviour.
      clearInterval(sweeper);
      await closeSessions(sessions);

      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        // A client that ignores the stream ending must not be able to pin the
        // process open. Closing sessions first is the polite half; this is the
        // half that means shutdown is bounded whatever the client does.
        httpServer.closeAllConnections();
      });
    },
  };
}

function closeSessions(
  sessions: Map<string, { transport: StreamableHTTPServerTransport; lastSeenMs: number }>,
): Promise<unknown[]> {
  return Promise.all([...sessions.values()].map((entry) => entry.transport.close().catch(() => undefined)));
}
