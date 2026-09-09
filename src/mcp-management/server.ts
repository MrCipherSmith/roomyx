import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { listLiveRooms } from "../installer/registry";
import { syncSkill } from "../installer/skill-sync";

export interface ManagementOptions {
  registryPath: string;
  bundledSkillPath: string;
  configPath: string;
}

export interface ManagementServeOptions {
  /** Defaults to 4320 so it does not collide with `roomyx serve` (4319). 0 selects an ephemeral port. */
  port?: number;
  host?: string;
  acknowledgeNonLoopback?: boolean;
}

/**
 * Second, standalone MCP server (independent of the per-room server in
 * ../server/index.ts) exposing skill-sync and room-listing as tools any MCP
 * client (Claude Code, Codex, keryx) can call directly. See
 * docs/requirements/roomyx-installer/specification.md "MCP Management
 * Server".
 */
export function createManagementMcpServer(options: ManagementOptions): McpServer {
  const server = new McpServer({ name: "roomyx-management", version: "0.1.0" });

  server.registerTool(
    "roomyx.rooms.list",
    {
      title: "List live rooms",
      description: "Rooms currently registered and confirmed live (liveness-checked, not just registry presence).",
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(await listLiveRooms(options.registryPath)) }],
    }),
  );

  server.registerTool(
    "roomyx.skills.sync",
    {
      title: "Sync the bundled startup-room skill",
      description: "Diffs/backs-up/writes the bundled skill into a target path (see decisions.md D-02 for safety rules).",
      inputSchema: {
        targetPath: z.string().min(1),
        dryRun: z.boolean().optional(),
        yes: z.boolean().optional(),
      },
    },
    async ({ targetPath, dryRun, yes }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            syncSkill({
              bundledSkillPath: options.bundledSkillPath,
              targetPath,
              configPath: options.configPath,
              dryRun,
              yes,
            }),
          ),
        },
      ],
    }),
  );

  return server;
}

export interface ManagementHandle {
  url: string;
  port: number;
  close(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Binds createManagementMcpServer() to a loopback HTTP transport, same
 * multi-session pattern as ../server/serve.ts: one StreamableHTTP transport
 * only ever completes a single initialize handshake, so each new session
 * gets its own transport + McpServer pair.
 */
export async function serveManagement(
  options: ManagementOptions,
  serveOptions: ManagementServeOptions,
): Promise<ManagementHandle> {
  const host = serveOptions.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host) && !serveOptions.acknowledgeNonLoopback) {
    throw new Error(
      `Refusing to bind roomyx mcp to non-loopback host "${host}" without --acknowledge-non-loopback.`,
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
    const mcpServer = createManagementMcpServer(options);
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
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      });
  });

  const port = serveOptions.port ?? 4320;
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
