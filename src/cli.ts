#!/usr/bin/env bun
import { join } from "node:path";
import { serve } from "./server/serve";
import { init } from "./installer/init";
import { registerRoom, deregisterRoom, listLiveRooms } from "./installer/registry";
import { serveManagement } from "./mcp-management/server";

/**
 * `roomyx init` / `roomyx serve` / `roomyx rooms list` / `roomyx mcp`.
 * The TUI is primarily `roomyx-client` (its own binary over src/client/index.ts)
 * so the orchestrator and the TUI stay independent processes (decisions.md
 * D-06). `roomyx client` is a thin alias that starts that same TUI in this
 * process — a separate invocation from `serve`/`mcp`, not a shared lifetime.
 */

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

function defaultRegistryPath(): string {
  return join(process.cwd(), ".roomyx", "rooms", "registry.json");
}

function defaultConfigPath(): string {
  return join(process.cwd(), ".roomyx", "config.json");
}

function bundledSkillPath(): string {
  return join(import.meta.dir, "bundled-skills", "startup-room", "SKILL.md");
}

const USAGE = "Usage: roomyx <init|serve <logPath>|client|mcp|rooms list>";

async function runInit(): Promise<void> {
  const result = init({ cwd: process.cwd(), bundledSkillPath: bundledSkillPath() });
  console.log(result.created ? `Created ${result.roomyxDir}` : `${result.roomyxDir} already initialized`);
}

async function runServe(logPath: string | undefined, rest: string[]): Promise<void> {
  if (!logPath) {
    console.error("Missing <logPath>. Usage: roomyx serve <logPath> [--port N]");
    process.exit(1);
  }
  const flags = parseFlags(rest);
  const handle = await serve(logPath, {
    port: flags.port !== undefined ? Number(flags.port) : undefined,
    host: typeof flags.host === "string" ? flags.host : undefined,
    acknowledgeNonLoopback: flags["acknowledge-non-loopback"] === true,
  });

  const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
  const entry = registerRoom(registryPath, { port: handle.port, logPath, pid: process.pid });

  console.log(`roomyx serving ${logPath} at ${handle.url}`);
  console.log(`room ID: ${entry.id} — attach with \`roomyx-client --room ${entry.id}\``);

  const shutdown = () => {
    deregisterRoom(registryPath, entry.id);
    void handle.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function runRoomsList(): Promise<void> {
  const rooms = await listLiveRooms(defaultRegistryPath());
  if (rooms.length === 0) {
    console.log("No live rooms.");
    return;
  }
  for (const room of rooms) {
    console.log(`${room.id}  port=${room.port}  log=${room.logPath}  started=${room.startedAt}`);
  }
}

async function runMcp(rest: string[]): Promise<void> {
  const flags = parseFlags(rest);
  const handle = await serveManagement(
    {
      registryPath: typeof flags.registry === "string" ? flags.registry : defaultRegistryPath(),
      bundledSkillPath: bundledSkillPath(),
      configPath: typeof flags.config === "string" ? flags.config : defaultConfigPath(),
    },
    {
      port: flags.port !== undefined ? Number(flags.port) : undefined,
      host: typeof flags.host === "string" ? flags.host : undefined,
      acknowledgeNonLoopback: flags["acknowledge-non-loopback"] === true,
    },
  );

  console.log(`roomyx mcp listening at ${handle.url}`);
  console.log("tools: roomyx.rooms.list, roomyx.skills.sync");

  const shutdown = () => {
    void handle.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "init") {
    await runInit();
  } else if (command === "serve") {
    await runServe(rest[0], rest.slice(1));
  } else if (command === "client") {
    const { runClient } = await import("./client/index");
    await runClient(rest);
  } else if (command === "mcp") {
    await runMcp(rest);
  } else if (command === "rooms" && rest[0] === "list") {
    await runRoomsList();
  } else {
    console.error(USAGE);
    console.error("The terminal UI is also a separate binary: roomyx-client [--room <id>]");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
