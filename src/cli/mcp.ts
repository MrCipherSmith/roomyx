import { serveManagement } from "../mcp-management/server";
import { REGISTRY_FLAG, bundledSkillPath, defaultConfigPath, defaultRegistryPath, runUntilSignal } from "./shared";
import type { Command } from "./shared";

export const mcpCommand: Command = {
  usage: "roomyx mcp [flags]",
  summary: "start the management MCP server",
  notes: "Default port 4320, so it does not collide with `roomyx serve`.",
  flags: {
    stdio: { type: "boolean", describe: "Speak MCP over stdin/stdout instead of HTTP (what an MCP client spawns)" },
    port: { type: "number", describe: "Listen port (default 4320; 0 picks an ephemeral one)" },
    host: { type: "string", describe: "Bind address (default 127.0.0.1)" },
    "acknowledge-non-loopback": { type: "boolean", describe: "Required to bind a non-loopback host" },
    registry: REGISTRY_FLAG,
    config: { type: "string", describe: "Config file (default .roomyx/config.json)" },
  },
  run: async ({ flags }) => {
    const managementOptions = {
      registryPath: typeof flags.registry === "string" ? flags.registry : defaultRegistryPath(),
      bundledSkillPath: bundledSkillPath(),
      configPath: typeof flags.config === "string" ? flags.config : defaultConfigPath(),
    };

    if (flags.stdio === true) {
      // The transport an MCP client actually wants: it spawns the process and
      // owns its lifetime, so there is no port to pick, nothing to leave
      // running, and no registration that points at something not started
      // yet. This is what `roomyx init` writes into `.mcp.json`.
      //
      // **Nothing may be printed to stdout here** — stdout is the protocol
      // channel, and one stray line of greeting is a parse error at the far
      // end. The HTTP branch below prints because it has a stdout to itself.
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
      const { createManagementMcpServer } = await import("../mcp-management/server");
      const server = createManagementMcpServer(managementOptions);
      await server.connect(new StdioServerTransport());
      // The client closes the pipe when it is done; there is no port to
      // release, so the signal handlers the HTTP branch installs would have
      // nothing to do.
      return;
    }

    const handle = await serveManagement(managementOptions, {
      port: typeof flags.port === "number" ? flags.port : undefined,
      host: typeof flags.host === "string" ? flags.host : undefined,
      acknowledgeNonLoopback: flags["acknowledge-non-loopback"] === true,
    });

    console.log(`roomyx mcp listening at ${handle.url}`);
    console.log("tools: roomyx.rooms.list, roomyx.skills.sync");

    runUntilSignal(() => handle.close());
  },
};
