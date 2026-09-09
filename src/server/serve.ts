import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRoomMcpServer } from "./index";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface ServeOptions {
  /** Defaults to 4319 (specification.md's default). 0 selects an ephemeral port. */
  port?: number;
  host?: string;
  acknowledgeNonLoopback?: boolean;
}

export interface ServeHandle {
  url: string;
  port: number;
  close(): Promise<void>;
}

/**
 * Binds `createRoomMcpServer(logPath)` to a loopback HTTP transport
 * (StreamableHTTP). Supports multiple, fully independent client sessions
 * against one long-lived server process — a single `StreamableHTTPServerTransport`
 * only ever completes ONE `initialize` handshake for its whole lifetime (an
 * independent review reproduced this concretely: a second client, even a
 * short-lived liveness check, gets "Server already initialized" and the
 * transport is permanently unusable afterward). Each new session (a request
 * with no `mcp-session-id` header) gets its own transport + `McpServer` pair,
 * tracked by session id via `onsessioninitialized`/`onsessionclosed`;
 * subsequent requests carrying that header are routed to the existing pair.
 * Refuses non-loopback hosts unless explicitly acknowledged (mirrors `keryx
 * serve`'s own convention — see docs/requirements/roomyx/decisions.md D-06).
 */
export async function serve(logPath: string, options: ServeOptions): Promise<ServeHandle> {
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host) && !options.acknowledgeNonLoopback) {
    throw new Error(
      `Refusing to bind roomyx serve to non-loopback host "${host}" without --acknowledge-non-loopback.`,
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
    const mcpServer = createRoomMcpServer(logPath);
    await mcpServer.connect(transport);
    return transport;
  }

  const httpServer = createServer((req, res) => {
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

  const port = options.port ?? 4319;
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, host, () => resolve());
    });
  } catch (error) {
    await Promise.all([...sessions.values()].map((t) => t.close().catch(() => undefined)));
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
          await Promise.all([...sessions.values()].map((t) => t.close().catch(() => undefined)));
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
