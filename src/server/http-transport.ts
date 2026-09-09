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

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  async function createSession(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, transport);
      },
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
      },
    });
    const mcpServer = options.createMcpServer();
    await mcpServer.connect(transport);
    return transport;
  }

  const httpServer = createHttpServer((req, res) => {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;
    const existing = sessionId ? sessions.get(sessionId) : undefined;

    const transportPromise = existing ? Promise.resolve(existing) : createSession();
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
    await closeSessions(sessions);
    throw error;
  }

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;

  return {
    url: `http://${host}:${actualPort}/mcp`,
    port: actualPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close(async (error) => {
          // The management server used to skip this, so its sessions outlived
          // the process that owned them. One implementation, one behaviour.
          await closeSessions(sessions);
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

function closeSessions(sessions: Map<string, StreamableHTTPServerTransport>): Promise<unknown[]> {
  return Promise.all([...sessions.values()].map((t) => t.close().catch(() => undefined)));
}
