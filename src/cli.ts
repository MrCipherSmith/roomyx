#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serve } from "./server/serve";
import { init } from "./installer/init";
import { registerRoom, deregisterRoom, listLiveRooms } from "./installer/registry";
import { syncSkill } from "./installer/skill-sync";
import { appendMessage, createRoomLog, LEGAL_KINDS, parseRoster } from "./log/write";
import { MESSAGE_KINDS } from "./log/schema";
import type { MessageEnvelope } from "./log/types";
import { NAMED_TARGETS, resolveTargets } from "./installer/skill-targets";
import { serveManagement } from "./mcp-management/server";
import { ArgError, parseArgs, renderFlags } from "./cli/args";
import type { FlagSpecs, ParsedArgs } from "./cli/args";
import { CLIENT_FLAGS } from "./cli/specs";

/**
 * The TUI is primarily `roomyx-client` (its own binary over
 * src/client/index.ts) so the orchestrator and the TUI stay independent
 * processes (decisions.md D-06). `roomyx client` is a thin alias that starts
 * that same TUI in this process — a separate invocation from `serve`/`mcp`,
 * not a shared lifetime.
 *
 * Every command declares its flags rather than scanning argv by hand. See
 * `./cli/args` for what that fixes and why it was one defect rather than six.
 */

function defaultRegistryPath(): string {
  return join(process.cwd(), ".roomyx", "rooms", "registry.json");
}

function defaultConfigPath(): string {
  return join(process.cwd(), ".roomyx", "config.json");
}

function bundledSkillPath(): string {
  return join(import.meta.dir, "bundled-skills", "startup-room", "SKILL.md");
}

const REGISTRY_FLAG = { type: "string", describe: "Registry file (default .roomyx/rooms/registry.json)" } as const;

/**
 * Runs a long-lived server until a signal, then shuts it down once.
 *
 * Written once because there were three copies and they had drifted: the two
 * here handled SIGINT and SIGTERM and guarded nothing, while the client handled
 * SIGHUP as well and guarded re-entry. So closing a terminal (SIGHUP) killed
 * `roomyx serve` outright, skipping deregistration and leaving a stale registry
 * entry — which a recycled port then resurrects as a live room.
 *
 * `cleanup` runs *after* the close resolves, not before. Deregistering first
 * meant a shutdown that hung — and it hung whenever a client was attached —
 * removed the room from the registry while the process kept running and kept
 * the port. The room became invisible while still being served.
 */
function runUntilSignal(close: () => Promise<void>, cleanup: () => void = () => undefined): void {
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    void close()
      .catch((error: unknown) => {
        console.error(`shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        cleanup();
        process.exit(0);
      });
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, shutdown);
}

interface Command {
  usage: string;
  summary: string;
  /** Extra lines under the flag table. */
  notes?: string;
  flags: FlagSpecs;
  run: (args: ParsedArgs) => Promise<void>;
}

const COMMANDS: Record<string, Command> = {
  init: {
    usage: "roomyx init",
    summary: "scaffold .roomyx/ in this project",
    flags: {},
    run: async () => {
      const result = init({ cwd: process.cwd(), bundledSkillPath: bundledSkillPath() });
      console.log(result.created ? `Created ${result.roomyxDir}` : `${result.roomyxDir} already initialized`);
    },
  },

  "room new": {
    usage: "roomyx room new <path> --goal <statement> [flags]",
    summary: "create a room log",
    notes: "Refuses to overwrite an existing log — a room log is append-only.",
    flags: {
      goal: { type: "string", describe: "Required. What the room is for, in one sentence" },
      criteria: { type: "string", describe: "Success criteria, stored in the goal contract" },
      roster: { type: "string", describe: "Participants, as id:Name,id2:Name2" },
    },
    run: async ({ positionals, flags }) => {
      const path = positionals[0];
      if (!path) throw new ArgError("Missing <path>.");
      const goalStatement = flags.goal;
      if (typeof goalStatement !== "string") {
        throw new ArgError("Missing --goal. A room without a stated goal has nothing to converge on.");
      }
      const absolute = resolve(path);
      createRoomLog(absolute, {
        goalStatement,
        criteria: typeof flags.criteria === "string" ? flags.criteria : undefined,
        roster: typeof flags.roster === "string" ? parseRoster(flags.roster) : [],
      });
      console.log(`Created ${absolute}`);
      console.log(`serve it with \`roomyx serve ${path}\``);
    },
  },

  "room append": {
    usage: "roomyx room append <path> --from <id> --body <text> [flags]",
    summary: "append a message to a room log",
    notes:
      "Refuses when a live room is serving that log: if that room has a\n  dispatcher, the dispatcher is the single writer (D-01a). --force appends\n  anyway — a room served by bare `roomyx serve` has no dispatcher to race.",
    flags: {
      from: { type: "string", describe: "Required. Participant id" },
      body: { type: "string", describe: "Required. The message" },
      kind: { type: "string", describe: "Message kind, e.g. challenge" },
      "in-reply-to": { type: "number", describe: "seq of the message replied to" },
      force: { type: "boolean", describe: "Append even if a live room serves this log" },
      registry: REGISTRY_FLAG,
    },
    run: async ({ positionals, flags }) => {
      const path = positionals[0];
      if (!path) throw new ArgError("Missing <path>.");
      const from = flags.from;
      const body = flags.body;
      if (typeof from !== "string" || typeof body !== "string") {
        throw new ArgError("Both --from and --body are required.");
      }

      const absolute = resolve(path);
      if (flags.force !== true) {
        const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
        const serving = (await listLiveRooms(registryPath)).find((room) => room.logPath === absolute);
        if (serving) {
          // The old wording ended "Pass --force if you know it isn't" — it asked
          // the operator to assert the room is gone. But the common case for
          // reaching this message is a room served by bare `roomyx serve`, where
          // the room is genuinely live and simply has no dispatcher attached, so
          // there is no second writer to race. The flag was the right escape
          // hatch behind a claim that was false exactly when you needed it.
          //
          // roomyx cannot tell the two apart: the registry records that a room
          // serves this path, not whether anything is dispatching into it. So
          // say what is known and let the operator judge, rather than making
          // --force mean something untrue.
          throw new ArgError(
            `A live room (${serving.id}) is serving this log. If it has a dispatcher, that dispatcher is the log's single writer (D-01a) and appending here races it. Pass --force to append anyway.`,
          );
        }
      }

      // Refused here, in the grammar, so the error names the flag the operator
      // typed rather than a field name from the on-disk schema. `appendMessage`
      // validates too — that is the guard that cannot be bypassed — but a
      // message about `--kind` belongs to the CLI that owns the flag.
      const kind = typeof flags.kind === "string" ? flags.kind : undefined;
      if (kind !== undefined && !(MESSAGE_KINDS as readonly string[]).includes(kind)) {
        throw new ArgError(`Unknown --kind "${kind}". Known kinds: ${LEGAL_KINDS}.`);
      }
      const inReplyTo = typeof flags["in-reply-to"] === "number" ? flags["in-reply-to"] : undefined;
      if (inReplyTo !== undefined && (!Number.isInteger(inReplyTo) || inReplyTo < 1)) {
        throw new ArgError(`--in-reply-to must be a whole number of at least 1, not ${inReplyTo}.`);
      }

      const message = appendMessage(absolute, {
        from,
        body,
        kind: kind as MessageEnvelope["kind"],
        inReplyTo,
      });
      console.log(`Appended seq ${message.seq} from ${message.from}.`);
    },
  },

  serve: {
    usage: "roomyx serve <logPath> [flags]",
    summary: "serve a room log over MCP",
    flags: {
      port: { type: "number", describe: "Listen port (default 4319; 0 picks an ephemeral one)" },
      host: { type: "string", describe: "Bind address (default 127.0.0.1)" },
      "acknowledge-non-loopback": { type: "boolean", describe: "Required to bind a non-loopback host" },
      registry: REGISTRY_FLAG,
    },
    run: async ({ positionals, flags }) => {
      const logPath = positionals[0];
      if (!logPath) throw new ArgError("Missing <logPath>.");

      // Absolute, because the registry outlives this process's working
      // directory: `roomyx-client` resolves rooms from wherever the person
      // happened to run it, and a relative logPath means nothing there.
      const absoluteLogPath = resolve(logPath);
      const handle = await serve(absoluteLogPath, {
        port: typeof flags.port === "number" ? flags.port : undefined,
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

      runUntilSignal(
        () => handle.close(),
        () => deregisterRoom(registryPath, entry.id),
      );
    },
  },

  "rooms list": {
    usage: "roomyx rooms list [flags]",
    summary: "live rooms, confirmed by a real call rather than by the file",
    flags: { registry: REGISTRY_FLAG },
    run: async ({ flags }) => {
      // `--registry` used to be accepted here and silently ignored: this
      // command took no arguments at all and read the default path, so
      // `rooms list --registry /nonexistent.json` printed "No live rooms"
      // about a different file.
      const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
      const rooms = await listLiveRooms(registryPath);
      if (rooms.length === 0) {
        console.log("No live rooms.");
        return;
      }
      for (const room of rooms) {
        console.log(`${room.id}  port=${room.port}  log=${room.logPath}  started=${room.startedAt}`);
      }
    },
  },

  client: {
    usage: "roomyx client [flags]",
    summary: "attach the terminal UI (same as the roomyx-client binary)",
    flags: CLIENT_FLAGS,
    run: async ({ flags }) => {
      const { runClient } = await import("./client/index");
      await runClient(flags);
    },
  },

  mcp: {
    usage: "roomyx mcp [flags]",
    summary: "start the management MCP server",
    notes: "Default port 4320, so it does not collide with `roomyx serve`.",
    flags: {
      port: { type: "number", describe: "Listen port (default 4320; 0 picks an ephemeral one)" },
      host: { type: "string", describe: "Bind address (default 127.0.0.1)" },
      "acknowledge-non-loopback": { type: "boolean", describe: "Required to bind a non-loopback host" },
      registry: REGISTRY_FLAG,
      config: { type: "string", describe: "Config file (default .roomyx/config.json)" },
    },
    run: async ({ flags }) => {
      const handle = await serveManagement(
        {
          registryPath: typeof flags.registry === "string" ? flags.registry : defaultRegistryPath(),
          bundledSkillPath: bundledSkillPath(),
          configPath: typeof flags.config === "string" ? flags.config : defaultConfigPath(),
        },
        {
          port: typeof flags.port === "number" ? flags.port : undefined,
          host: typeof flags.host === "string" ? flags.host : undefined,
          acknowledgeNonLoopback: flags["acknowledge-non-loopback"] === true,
        },
      );

      console.log(`roomyx mcp listening at ${handle.url}`);
      console.log("tools: roomyx.rooms.list, roomyx.skills.sync");

      runUntilSignal(() => handle.close());
    },
  },

  "skills sync": {
    usage: "roomyx skills sync --target <claude|codex|keryx|all|path> [flags]",
    summary: "install the bundled startup-room skill",
    notes:
      "Without --yes nothing is written: the run reports what it would do and\n  stops. D-02 — landing on a real skill file is a deliberate act, not a\n  side effect of the mechanism existing.",
    flags: {
      target: { type: "string", describe: `Required. ${NAMED_TARGETS.join(", ")}, all, or a literal path` },
      yes: { type: "boolean", describe: "Actually write" },
      "dry-run": { type: "boolean", describe: "Report only (the default)" },
      config: { type: "string", describe: "Config file the sync records hashes in" },
    },
    run: async ({ flags }) => {
      const target = flags.target;
      if (typeof target !== "string") {
        throw new ArgError(`Missing --target. Expected one of ${NAMED_TARGETS.join(", ")}, all, or a path.`);
      }

      const yes = flags.yes === true;
      // The gate itself lives in `syncSkill` now, computed once for every
      // surface — this line only forwards what the operator typed.
      const dryRun = flags["dry-run"] === true;
      const configPath = typeof flags.config === "string" ? flags.config : defaultConfigPath();
      if (!existsSync(configPath)) {
        throw new ArgError(`No ${configPath}. Run \`roomyx init\` first.`);
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
          // "not written" was the message whenever `dryRun` was false, which
          // after the gate moved into syncSkill meant the ordinary
          // no-flags run reported a bare refusal instead of the sentence that
          // says how to proceed. Branch on why nothing was written, not on
          // which flag was passed.
          console.log(result.wouldWrite ? "  would write (pass --yes to apply)" : "  not written");
        }
      }
    },
  },
};

/** package.json ships in the tarball (see `files`), so this resolves for an installed copy too. */
function version(): string {
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
    version: string;
  };
  return manifest.version;
}

function topLevelHelp(): string {
  const names = Object.keys(COMMANDS);
  const width = Math.max(...names.map((n) => n.length));
  return [
    "Usage: roomyx <command> [flags]",
    "",
    ...names.map((n) => `  ${n.padEnd(width)}  ${COMMANDS[n]!.summary}`),
    "",
    "  --version",
    "",
    "`roomyx <command> --help` describes one command.",
    "The terminal UI is also a separate binary: roomyx-client [--room <id>]",
  ].join("\n");
}

function commandHelp(command: Command): string {
  const table = renderFlags(command.flags);
  return [
    command.usage,
    "",
    `  ${command.summary}`,
    ...(command.notes ? ["", `  ${command.notes}`] : []),
    ...(table ? ["", table] : []),
  ].join("\n");
}

/** Longest command name first, so "room new" wins over a hypothetical "room". */
function matchCommand(argv: string[]): { name: string; command: Command; rest: string[] } | undefined {
  for (const name of Object.keys(COMMANDS).sort((a, b) => b.split(" ").length - a.split(" ").length)) {
    const words = name.split(" ");
    if (words.every((word, i) => argv[i] === word)) {
      return { name, command: COMMANDS[name]!, rest: argv.slice(words.length) };
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv[0] === "--version" || argv[0] === "-v") {
    console.log(version());
    return;
  }

  const matched = matchCommand(argv);
  if (!matched) {
    // `--help` is a request and exits 0. A bare `roomyx`, or a command that
    // isn't one, is a usage error and exits 1 — the convention git follows,
    // and the distinction a shell script or an agent actually reads.
    const askedForHelp = argv[0] === "--help" || argv[0] === "-h";
    console[askedForHelp ? "log" : "error"](topLevelHelp());
    process.exit(askedForHelp ? 0 : 1);
  }

  const parsed = parseArgs(matched.rest, matched.command.flags);
  if (parsed.help) {
    console.log(commandHelp(matched.command));
    return;
  }
  await matched.command.run(parsed);
}

main().catch((error) => {
  if (error instanceof ArgError) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
