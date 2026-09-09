import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { serveMcpOverHttp } from "../server/http-transport";
import type { McpHttpTransportHandle } from "../server/http-transport";
import { listLiveRooms } from "../installer/registry";
import { syncSkill } from "../installer/skill-sync";
import { NAMED_TARGETS, resolveTargets } from "../installer/skill-targets";

export interface ManagementOptions {
  registryPath: string;
  bundledSkillPath: string;
  configPath: string;
  /**
   * The project a project-scoped target resolves against — `keryx` keeps its
   * skills in `<project>/.metaproject/project-skills/`. Defaults to
   * `process.cwd()`, which is right for `roomyx mcp` and wrong for a
   * long-lived embedded server whose working directory is somebody else's.
   * Every other path this server touches is already explicit; this one was
   * the exception.
   */
  cwd?: string;
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
      description:
        "Diffs/backs-up/writes the bundled skill into a named runtime's skill location (see decisions.md D-02 for safety rules).",
      inputSchema: {
        // Named targets only. This tool used to accept a literal `targetPath`,
        // which made it an arbitrary-path file writer reachable over a loopback
        // port with no authentication — a browser on any page the operator
        // visits could drive it cross-origin. The CLI keeps the literal-path
        // escape hatch, because that is the operator on their own machine;
        // the network surface does not get one.
        target: z.enum([...NAMED_TARGETS, "all"]).describe("A runtime by name, or `all`."),
        dryRun: z.boolean().optional(),
        yes: z.boolean().optional(),
      },
    },
    async ({ target, dryRun, yes }) => {
      const targets = resolveTargets(target, options.cwd);
      const results = targets.map(({ name, path }) => ({
        target: name,
        path,
        ...syncSkill({
          bundledSkillPath: options.bundledSkillPath,
          targetPath: path,
          configPath: options.configPath,
          dryRun,
          yes,
        }),
      }));
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
    },
  );

  return server;
}

export type ManagementHandle = McpHttpTransportHandle;

export interface ManagementServeOptions {
  /** Defaults to 4320 so it does not collide with `roomyx serve` (4319). 0 selects an ephemeral port. */
  port?: number;
  host?: string;
  acknowledgeNonLoopback?: boolean;
}

/**
 * Serves the management tools over the shared loopback HTTP transport. The
 * session, binding and shutdown behaviour is `../server/http-transport`'s —
 * this file used to carry its own copy, and the copies had already drifted.
 */
export async function serveManagement(
  options: ManagementOptions,
  serveOptions: ManagementServeOptions,
): Promise<ManagementHandle> {
  return serveMcpOverHttp({
    createMcpServer: () => createManagementMcpServer(options),
    commandLabel: "roomyx mcp",
    defaultPort: 4320,
    port: serveOptions.port,
    host: serveOptions.host,
    acknowledgeNonLoopback: serveOptions.acknowledgeNonLoopback,
  });
}
