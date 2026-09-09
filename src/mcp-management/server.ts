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
  port: number;
  host?: string;
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

/** Binds createManagementMcpServer() to a loopback HTTP transport, same pattern as ../server/serve.ts. */
export async function serveManagement(
  options: ManagementOptions,
  serveOptions: ManagementServeOptions,
): Promise<ManagementHandle> {
  const host = serveOptions.host ?? "127.0.0.1";
  const mcpServer = createManagementMcpServer(options);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
  await mcpServer.connect(transport);

  const httpServer = createServer((req, res) => {
    transport.handleRequest(req, res).catch((error) => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(serveOptions.port, host, () => resolve());
    });
  } catch (error) {
    await mcpServer.close().catch(() => undefined);
    throw error;
  }

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : serveOptions.port;

  return {
    url: `http://${host}:${actualPort}/mcp`,
    port: actualPort,
    close: () => new Promise<void>((resolve, reject) => httpServer.close((err) => (err ? reject(err) : resolve()))),
  };
}
