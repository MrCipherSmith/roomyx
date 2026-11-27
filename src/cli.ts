#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ArgError, parseArgs, renderFlags } from "./cli/args";
import { initCommand, setupCommand } from "./cli/init";
import { roomNew, roomDelta, roomCommands, roomAck } from "./cli/room";
import { roomAppend } from "./cli/room-append";
import { serveCommand } from "./cli/serve";
import { roomsList, roomsHistory } from "./cli/rooms";
import { personasCommand } from "./cli/personas";
import { clientCommand } from "./cli/client";
import { mcpCommand } from "./cli/mcp";
import { skillsSync } from "./cli/skills";
import type { Command } from "./cli/shared";

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

const COMMANDS: Record<string, Command> = {
  init: initCommand,
  "room new": roomNew,
  "room append": roomAppend,
  "room delta": roomDelta,
  "room commands": roomCommands,
  "room ack": roomAck,
  serve: serveCommand,
  "rooms list": roomsList,
  setup: setupCommand,
  personas: personasCommand,
  "rooms history": roomsHistory,
  client: clientCommand,
  mcp: mcpCommand,
  "skills sync": skillsSync,
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
