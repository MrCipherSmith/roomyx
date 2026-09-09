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
 * (StreamableHTTP, one session per connected client — the SDK's stateless
 * mode rejects the initial notification round-trip in this SDK version,
 * so session-per-connection is used instead; harmless for the single-room,
 * single-or-few-clients use case). Refuses non-loopback hosts unless
 * explicitly acknowledged (mirrors `keryx serve`'s own convention — see
 * docs/requirements/room-tui/decisions.md D-06).
 */
export async function serve(logPath: string, options: ServeOptions): Promise<ServeHandle> {
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host) && !options.acknowledgeNonLoopback) {
    throw new Error(
      `Refusing to bind room-tui serve to non-loopback host "${host}" without --acknowledge-non-loopback.`,
    );
  }

  const mcpServer = createRoomMcpServer(logPath);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
  await mcpServer.connect(transport);

  const httpServer = createServer((req, res) => {
    transport.handleRequest(req, res).catch((error) => {
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
    await mcpServer.close().catch(() => undefined);
    throw error;
  }

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;

  return {
    url: `http://${host}:${actualPort}/mcp`,
    port: actualPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
