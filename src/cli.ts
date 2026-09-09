#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serve } from "./server/serve";
import { init } from "./installer/init";
import { registerRoom, deregisterRoom, listLiveRooms } from "./installer/registry";
import { syncSkill } from "./installer/skill-sync";
import { appendMessage, createRoomLog, parseRoster } from "./log/write";
import { NAMED_TARGETS, resolveTargets } from "./installer/skill-targets";
import { serveManagement } from "./mcp-management/server";

/**
 * `roomyx init` / `roomyx serve` / `roomyx rooms list` / `roomyx mcp` /
 * `roomyx skills sync`.
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

const USAGE = [
  "Usage: roomyx <command>",
  "",
  "  init                                    scaffold .roomyx/ in this project",
  "  room new <path> --goal <s>              create a room log",
  "  room append <path> --from <id> --body <s>   append a message to one",
  "  serve <logPath>                         serve a room log over MCP",
  "  rooms list                              live rooms, liveness-checked",
  "  client                                  attach the terminal UI",
  "  mcp                                     start the management MCP server",
  "  skills sync --target <claude|codex|keryx|all|path>",
  "  --version",
].join("\n");

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
  // Absolute, because the registry outlives this process's working directory:
  // `roomyx-client` resolves rooms from wherever the person happened to run it,
  // and a relative logPath means nothing there. The specification's registry
  // example has always shown an absolute path; only the code disagreed.
  const absoluteLogPath = resolve(logPath);
  const handle = await serve(absoluteLogPath, {
    port: flags.port !== undefined ? Number(flags.port) : undefined,
    host: typeof flags.host === "string" ? flags.host : undefined,
    acknowledgeNonLoopback: flags["acknowledge-non-loopback"] === true,
  });

  const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
  const entry = registerRoom(registryPath, {
    port: handle.port,
    logPath: absoluteLogPath,
    pid: process.pid,
  });

  console.log(`roomyx serving ${absoluteLogPath} at ${handle.url}`);
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

/**
 * `roomyx skills sync --target <claude|codex|keryx|all|path> [--dry-run] [--yes]`.
 *
 * Without `--yes` this reports what it would do and writes nothing — the
 * specification's wording, and D-02's requirement that landing on a real skill
 * file be a separate, deliberate act rather than a side effect of the
 * mechanism existing. `--dry-run` is then the same thing said explicitly.
 */
async function runSkillsSync(rest: string[]): Promise<void> {
  const flags = parseFlags(rest);
  const target = typeof flags.target === "string" ? flags.target : undefined;
  if (!target) {
    console.error(`Missing --target. Expected one of ${NAMED_TARGETS.join(", ")}, all, or a path.`);
    process.exit(1);
  }

  const yes = flags.yes === true;
  const dryRun = flags["dry-run"] === true || !yes;
  const configPath = typeof flags.config === "string" ? flags.config : defaultConfigPath();

  if (!existsSync(configPath)) {
    console.error(`No ${configPath}. Run \`roomyx init\` first.`);
    process.exit(1);
  }

  for (const { name, path } of resolveTargets(target)) {
    const result = syncSkill({
      bundledSkillPath: bundledSkillPath(),
      targetPath: path,
      configPath,
      dryRun,
      yes,
    });
    console.log(name === path ? path : `${name}: ${path}`);
    for (const warning of result.warnings) console.log(`  warning: ${warning}`);
    if (result.written) {
      console.log(result.backedUpTo ? `  written (backup: ${result.backedUpTo})` : "  written");
    } else {
      console.log(dryRun ? "  would write (pass --yes to apply)" : "  not written");
    }
  }
}

/**
 * `roomyx room new <path> --goal <s> [--criteria <s>] [--roster id:Name,...]`
 * `roomyx room append <path> --from <id> --body <s> [--kind k] [--in-reply-to n] [--force]`
 *
 * D-01a: creating a log nobody serves takes the writer count 0→1 and needs no
 * exception. Appending to a log a live room is serving would mint a second
 * writer, so it is refused unless the caller says they know better.
 */
async function runRoomNew(path: string | undefined, rest: string[]): Promise<void> {
  if (!path) {
    console.error("Missing <path>. Usage: roomyx room new <path> --goal <statement> [--roster id:Name,...]");
    process.exit(1);
  }
  const flags = parseFlags(rest);
  const goalStatement = typeof flags.goal === "string" ? flags.goal : undefined;
  if (!goalStatement) {
    console.error("Missing --goal. A room without a stated goal has nothing to converge on.");
    process.exit(1);
  }
  const absolute = resolve(path);
  createRoomLog(absolute, {
    goalStatement,
    criteria: typeof flags.criteria === "string" ? flags.criteria : undefined,
    roster: typeof flags.roster === "string" ? parseRoster(flags.roster) : [],
  });
  console.log(`Created ${absolute}`);
  console.log(`serve it with \`roomyx serve ${path}\``);
}

async function runRoomAppend(path: string | undefined, rest: string[]): Promise<void> {
  if (!path) {
    console.error("Missing <path>. Usage: roomyx room append <path> --from <id> --body <text>");
    process.exit(1);
  }
  const flags = parseFlags(rest);
  const from = typeof flags.from === "string" ? flags.from : undefined;
  const body = typeof flags.body === "string" ? flags.body : undefined;
  if (!from || !body) {
    console.error("Missing --from or --body.");
    process.exit(1);
  }

  const absolute = resolve(path);
  if (flags.force !== true) {
    const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
    const live = await listLiveRooms(registryPath);
    const serving = live.find((room) => room.logPath === absolute);
    if (serving) {
      console.error(
        `A live room (${serving.id}) is serving this log; its dispatcher is the single writer (D-01). Pass --force if you know it isn't.`,
      );
      process.exit(1);
    }
  }

  const message = appendMessage(absolute, {
    from,
    body,
    kind: typeof flags.kind === "string" ? (flags.kind as never) : undefined,
    inReplyTo: flags["in-reply-to"] !== undefined ? Number(flags["in-reply-to"]) : undefined,
  });
  console.log(`Appended seq ${message.seq} from ${message.from}.`);
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

/** package.json ships in the tarball (see `files`), so this resolves for an installed copy too. */
function version(): string {
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
    version: string;
  };
  return manifest.version;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "--version" || command === "-v") {
    console.log(version());
  } else if (command === "init") {
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
  } else if (command === "skills" && rest[0] === "sync") {
    await runSkillsSync(rest.slice(1));
  } else if (command === "room" && rest[0] === "new") {
    await runRoomNew(rest[1], rest.slice(2));
  } else if (command === "room" && rest[0] === "append") {
    await runRoomAppend(rest[1], rest.slice(2));
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
