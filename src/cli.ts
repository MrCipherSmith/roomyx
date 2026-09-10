#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serve } from "./server/serve";
import { createServerShutdown } from "./server/shutdown";
import { init } from "./installer/init";
import {
  findRoomServing,
  probeRoomState,
  registerRoom,
  deregisterRoom,
  listRoomsWithLiveness,
} from "./installer/registry";
import { archiveRoom, defaultHistoryPath, readHistory } from "./installer/history";
import { syncSkill } from "./installer/skill-sync";
import { appendMessages, createRoomLog, LEGAL_KINDS, parseRoster } from "./log/write";
import type { AppendMessageOptions } from "./log/write";
import { acquireWriterLease, readWriterLease, writerLeasePathFor } from "./writer-lease";
import { MESSAGE_KINDS } from "./log/schema";
import { LogWriteError } from "./log/write";
import type { MessageEnvelope } from "./log/types";
import { NAMED_TARGETS, resolveTargets } from "./installer/skill-targets";
import { serveManagement } from "./mcp-management/server";
import { ArgError, parseArgs, renderFlags } from "./cli/args";
import type { FlagSpecs, FlagValues, ParsedArgs } from "./cli/args";
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

/**
 * Turns the flags into the messages to write, or refuses.
 *
 * Four ways in, and they do not compose: an envelope says everything, so a
 * `--from` beside it is an ambiguity rather than an override — and guessing
 * which one the caller meant is how a body goes into the wrong speaker's mouth.
 */
function pendingAppends(flags: FlagValues): AppendMessageOptions[] {
  // Two different things are being chosen here, and conflating them was wrong:
  // `--json` and `--many` carry a whole envelope (speaker included), while
  // `--body` and `--body-file` carry only the body and still need `--from`.
  // Refusing `--body-file --from b` refused a combination that has no ambiguity
  // in it at all.
  const envelopeSources = [flags.json !== undefined, flags.many === true].filter(Boolean).length;
  if (envelopeSources > 1) throw new ArgError("Use one of --json or --many, not both.");
  const bodySources = [flags.body !== undefined, flags["body-file"] !== undefined].filter(Boolean).length;
  if (bodySources > 1) throw new ArgError("Use one of --body or --body-file, not both.");

  if (envelopeSources === 1) {
    const conflicting = ["from", "body", "body-file", "kind", "in-reply-to"].filter((f) => flags[f] !== undefined);
    if (conflicting.length > 0) {
      // An envelope says everything. Silently preferring one source is how a
      // body ends up in the log under a speaker nobody chose.
      throw new ArgError(
        `--json/--many carry the whole envelope, so --${conflicting.join(", --")} cannot be combined with them.`,
      );
    }
    return flags.many === true ? parseBatch(readStdin()) : [envelopeFrom(flags.json as string)];
  }

  const from = flags.from;
  if (typeof from !== "string" || from === "") {
    throw new ArgError("Both --from and --body are required (or pass --json, --body-file or --many).");
  }
  const body = typeof flags["body-file"] === "string" ? bodyFromFile(flags["body-file"]) : flags.body;
  if (typeof body !== "string") throw new ArgError("Both --from and --body are required.");

  const kind = typeof flags.kind === "string" ? flags.kind : undefined;
  if (kind !== undefined && !(MESSAGE_KINDS as readonly string[]).includes(kind)) {
    throw new ArgError(`Unknown --kind "${kind}". Known kinds: ${LEGAL_KINDS}.`);
  }
  const inReplyTo = typeof flags["in-reply-to"] === "number" ? flags["in-reply-to"] : undefined;
  if (inReplyTo !== undefined && (!Number.isInteger(inReplyTo) || inReplyTo < 1)) {
    throw new ArgError(`--in-reply-to must be a whole number of at least 1, not ${inReplyTo}.`);
  }
  return [{ from, body, kind: kind as MessageEnvelope["kind"], inReplyTo }];
}

function readStdin(): string {
  if (process.stdin.isTTY === true) {
    // Reading fd 0 from a terminal blocks until Ctrl-D, which reads as a hang.
    throw new ArgError("This flag reads the message from stdin, and stdin is a terminal. Pipe the text in, or use --body.");
  }
  return readFileSync(0, "utf8");
}

function bodyFromFile(file: string): string {
  // A trailing newline is what every editor and every `echo` adds; it is not
  // part of what the speaker said, and it would land inside the quoted body.
  const raw = file === "-" ? readStdin() : readFileSync(resolve(file), "utf8");
  return raw.replace(/\r?\n$/, "");
}

const ENVELOPE_KEYS = ["from", "body", "kind", "in_reply_to"] as const;

/**
 * Parses one envelope, refusing keys that would silently vanish.
 *
 * An unknown key is a refusal rather than something ignored: `seq` and `type`
 * are assigned by the writer, and a caller who passes one believes they chose
 * it — so accepting the envelope while dropping their value is the one answer
 * that cannot be discovered from the log.
 */
function envelopeFrom(text: string): AppendMessageOptions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new ArgError(`--json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ArgError("--json must be a JSON object.");
  }
  const envelope = parsed as Record<string, unknown>;
  for (const key of Object.keys(envelope)) {
    if (!(ENVELOPE_KEYS as readonly string[]).includes(key)) {
      throw new ArgError(`--json has an unknown key "${key}". Allowed: ${ENVELOPE_KEYS.join(", ")}.`);
    }
  }
  const { from, body, kind, in_reply_to: inReplyTo } = envelope;
  if (typeof from !== "string" || from === "") throw new ArgError('--json needs a non-empty "from".');
  if (typeof body !== "string") throw new ArgError('--json needs a string "body".');
  if (kind !== undefined && (typeof kind !== "string" || !(MESSAGE_KINDS as readonly string[]).includes(kind))) {
    throw new ArgError(`--json "kind" must be one of: ${LEGAL_KINDS}.`);
  }
  if (inReplyTo !== undefined && (typeof inReplyTo !== "number" || !Number.isInteger(inReplyTo) || inReplyTo < 1)) {
    throw new ArgError('--json "in_reply_to" must be a whole number of at least 1.');
  }
  return {
    from,
    body,
    kind: kind as MessageEnvelope["kind"],
    inReplyTo: inReplyTo as number | undefined,
  };
}

function parseBatch(text: string): AppendMessageOptions[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new ArgError("--many read no envelopes from stdin.");
  return lines.map((line, index) => {
    try {
      return envelopeFrom(line);
    } catch (error) {
      throw new ArgError(`--many line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/**
 * Writes the batch, or none of it. `appendMessages` allocates consecutive `seq`
 * and validates every envelope before the first byte, so a refused batch leaves
 * the log exactly as it was.
 */
function writeAll(path: string, pending: AppendMessageOptions[]) {
  try {
    return appendMessages(path, pending);
  } catch (error) {
    if (error instanceof LogWriteError) throw new ArgError(error.message);
    throw error;
  }
}

/** The holder a take-over displaced, when there was one. */
function stateBefore(lease: import("./writer-lease").LeaseState): { pid: number; at: number } | undefined {
  if (lease.held) return { pid: lease.lease.pid, at: lease.lease.at };
  // A stale lease still identifies the writer that stopped: recording it is the
  // difference between a log that says "someone took this over" and one that
  // says who from.
  return lease.reason === "stale" ? { pid: lease.last.pid, at: lease.last.at } : undefined;
}

function bundledSkillPath(): string {
  return join(import.meta.dir, "bundled-skills", "startup-room", "SKILL.md");
}

const REGISTRY_FLAG = { type: "string", describe: "Registry file (default .roomyx/rooms/registry.json)" } as const;

/**
 * Wires the signals. The shutdown itself lives in `./server/shutdown`, where a
 * test can reach it — this module runs its entry point on import.
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
  const shutdown = createServerShutdown(close, cleanup);
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
    usage: "roomyx init [flags]",
    summary: "scaffold .roomyx/, then set up skills, MCP and git for this project",
    notes:
      "Interactive when the terminal allows it: tick what you want, see every\n  path before agreeing to it, and nothing is written until you submit.\n  Through a pipe or in CI it scaffolds .roomyx/ and asks nothing, so it can\n  never hang waiting for a keypress nobody is there to make.",
    flags: {
      yes: { type: "boolean", describe: "Apply the default selection without asking" },
      "no-interactive": { type: "boolean", describe: "Scaffold .roomyx/ only" },
    },
    run: async ({ flags }) => {
      const cwd = process.cwd();
      const result = init({ cwd, bundledSkillPath: bundledSkillPath() });
      console.log(result.created ? `Created ${result.roomyxDir}` : `${result.roomyxDir} already initialized`);

      const { buildPlan, selectedItems } = await import("./installer/init-plan");
      const { applyPlan } = await import("./installer/init-apply");

      const plan = buildPlan({ cwd });
      // A terminal on both ends or nothing to ask. `--yes` overrides, because
      // a script that has decided already should not be refused for lacking a
      // tty — but the default must never block a pipeline on a prompt.
      const interactive = process.stdout.isTTY === true && process.stdin.isTTY === true;
      if (flags["no-interactive"] === true || (!interactive && flags.yes !== true)) {
        console.log("");
        console.log("Nothing else was written. To install the skill and register the MCP server:");
        console.log("  roomyx init --yes          # the default selection, no prompt");
        console.log("  roomyx init                # pick, in a terminal");
        return;
      }

      let chosen = plan;
      if (flags.yes !== true) {
        const { runInitPicker } = await import("./client/init-screen");
        const picked = await runInitPicker(plan);
        if (picked === null) {
          console.log("Cancelled — nothing else was written.");
          return;
        }
        chosen = picked;
      }

      const results = applyPlan(selectedItems(chosen), {
        cwd,
        bundledSkillPath: bundledSkillPath(),
        configPath: join(cwd, ".roomyx", "config.json"),
      });

      console.log("");
      for (const line of results) {
        console.log(`${line.ok ? "  ok " : "  !! "} ${line.label}`);
        console.log(`       ${line.path} — ${line.message}`);
      }

      const failed = results.filter((line) => !line.ok).length;
      if (failed > 0) console.log(`\n${failed} item(s) failed. Everything else was applied.`);
      if (results.some((line) => line.ok && line.id.startsWith("skill:"))) {
        // The one thing an operator reliably forgets, and the symptom is
        // "roomyx installed the skill and my agent still cannot see it".
        console.log("\nRestart your agent — skills are discovered at startup.");
      }
      console.log("\nNext: roomyx room new .roomyx/rooms/logs/<name>.jsonl --goal \"<what the room is for>\"");
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
    usage: "roomyx room append <path> (--from <id> --body <text> | --json <envelope> | --body-file <file> | --many) [flags]",
    summary: "append a message to a room log",
    notes:
      "Refuses only when the room is live AND something is writing into it: a\n  live room with no dispatcher has no writer to race, so appending to it\n  needs no flag at all (D-01a, D-18). A lease that has expired means the\n  writer stopped without saying so — taking over then is a deliberate act,\n  --take-over, and it is recorded in the log.",
    flags: {
      from: { type: "string", describe: "Participant id" },
      body: { type: "string", describe: "The message" },
      json: { type: "string", describe: "A whole envelope: {from, body, kind?, in_reply_to?}" },
      "body-file": { type: "string", describe: "Read the body from a file, or - for stdin" },
      many: { type: "boolean", describe: "Read a JSONL batch of envelopes from stdin; all of them or none" },
      kind: { type: "string", describe: "Message kind, e.g. challenge" },
      "in-reply-to": { type: "number", describe: "seq of the message replied to" },
      "take-over": { type: "boolean", describe: "Write when the room is live but its writer is gone" },
      registry: REGISTRY_FLAG,
    },
    run: async ({ positionals, flags }) => {
      const path = positionals[0];
      if (!path) throw new ArgError("Missing <path>.");
      const absolute = resolve(path);

      const takeOver = flags["take-over"] === true;

      // Absolute, because the lease lives beside the registry and this process's
      // cwd is not the next process's: a relative `--registry` made the lease
      // land in a different directory depending on where the command was run.
      const absoluteRegistry = resolve(typeof flags.registry === "string" ? flags.registry : defaultRegistryPath());
      const leasePath = writerLeasePathFor(absoluteRegistry, absolute);

      // Across BOTH lists: an entry whose first probe timed out is `unconfirmed`,
      // and it may still have a dispatcher attached — which is the evidence this
      // guard needs. Searching only the confirmed list is how "the machine was
      // busy" turns into "nothing is writing into this log".
      const serving = findRoomServing(absolute, await listRoomsWithLiveness(absoluteRegistry));

      // Read the lease BEFORE the probe, and independently of its outcome. A
      // liveness probe that times out says "could not reach it", which is not
      // "nothing is writing into it" — and reading the lease only once the probe
      // succeeded meant a busy machine wrote into a room whose dispatcher was
      // perfectly alive.
      const lease = readWriterLease(leasePath);
      const dispatched = serving !== undefined ? ((await probeRoomState(serving))?.dispatcherAttached ?? undefined) : undefined;

      // Two independent pieces of evidence that someone else is writing: a live
      // dispatcher, and a lease somebody is refreshing. The second exists because
      // the first only holds for a server that was started with a lease path.
      const writerPresent = lease.held || dispatched === true;
      const writerWasThere = !writerPresent && lease.reason === "stale";

      if (writerPresent) {
        // Two different reasons to refuse, and they need different advice: a
        // lease that is merely stale will expire by itself, while a room that
        // reports a dispatcher will keep reporting one until the server is
        // stopped — waiting would be advice that never comes true.
        const advice =
          dispatched === true
            ? `Stop the server that is running the room; once it is gone, --take-over will let you write to this log.`
            : `Wait for that lease to expire (a writer that is running refreshes it), or stop the process holding it.`;
        throw new ArgError(
          `A writer is live in ${absolute}${serving === undefined ? "" : ` (room ${serving.id})`}` +
            `${lease.held ? ` — pid ${lease.lease.pid}` : " — the room reports a dispatcher attached"}. ` +
            `Two writers into one append-only log is the race D-01 exists to prevent, and nothing overrides a writer ` +
            `that is still there. ${advice}`,
        );
      }
      if (writerWasThere && !takeOver) {
        throw new ArgError(
          `A writer was in ${absolute}${serving === undefined ? "" : ` (room ${serving.id})`} and is gone — ` +
            `nothing holds the lease now. Writing means taking ownership from a room that looks supervised. ` +
            `Pass --take-over to do that deliberately; the log will record it.`,
        );
      }

      // Parsed only after the refusal: an operator whose command is going to be
      // rejected should not be made to pipe a batch in first, and a reader that
      // blocks on stdin while holding a decision helps nobody.
      const pending = pendingAppends(flags);

      const displaced = takeOver || writerWasThere ? stateBefore(lease) : undefined;
      const takingOver = takeOver || writerWasThere;

      // One batch, one lock section: the take-over trace goes in WITH the
      // messages it describes. Written as a second call it could fail on its
      // own, and a room written by hand while its writer was absent would read
      // afterwards as supervised — the one thing the trace exists to prevent.
      const written = writeAll(absolute, [
        ...pending,
        ...(takingOver
          ? [
              {
                from: "owner",
                kind: "status" as const,
                body:
                  `--take-over: ${pending.length} message(s) appended to ${absolute}` +
                  `${serving === undefined ? "" : ` while room ${serving.id} was live`} with no live writer` +
                  `${displaced === undefined ? " (no lease was held)" : ` (took over from pid ${displaced.pid})`}`,
              },
            ]
          : []),
      ]);

      if (takingOver) {
        // The lease is replaced with a new token, so a writer that was merely
        // paused cannot revive the one it lost by refreshing it — the whole
        // reason a take-over is not just a flag on the write.
        acquireWriterLease(leasePath, { pid: process.pid, ...(displaced === undefined ? {} : { takeOverFrom: displaced }) });
      }

      for (const message of written) console.log(`Appended seq ${message.seq} from ${message.from}.`);
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
      // Resolved before binding: the writer lease lives beside the registry, and
      // a server that acquires one after it starts answering would leave a
      // window where a live dispatcher looks like no writer at all.
      const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
      const handle = await serve(absoluteLogPath, {
        port: typeof flags.port === "number" ? flags.port : undefined,
        host: typeof flags.host === "string" ? flags.host : undefined,
        acknowledgeNonLoopback: flags["acknowledge-non-loopback"] === true,
        writerLeasePath: writerLeasePathFor(resolve(registryPath), absoluteLogPath),
      });

      const entry = registerRoom(registryPath, {
        port: handle.port,
        logPath: absoluteLogPath,
        pid: process.pid,
      });

      console.log(`roomyx serving ${absoluteLogPath} at ${handle.url}`);
      console.log(`room ID: ${entry.id} — attach with \`roomyx-client --room ${entry.id}\``);

      runUntilSignal(
        () => handle.close(),
        () => {
          // Archive before deregistering, not after: `archiveRoom` reads the
          // log to summarise it, and it reads better while the entry that says
          // where the log is still exists. The order also means a crash
          // between the two leaves the room recorded in history and still in
          // the registry, which the next prune resolves — rather than gone
          // from both.
          archiveRoom(defaultHistoryPath(registryPath), entry);
          deregisterRoom(registryPath, entry.id);
        },
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
      const { live, unconfirmed } = await listRoomsWithLiveness(registryPath);
      if (live.length === 0 && unconfirmed.length === 0) {
        // An empty registry and a registry whose rooms did not answer are
        // different facts, and the second used to print this same sentence —
        // which is how a serving room came to look like no room at all.
        console.log("No live rooms.");
        return;
      }
      for (const room of live) {
        console.log(`${room.id}  port=${room.port}  log=${room.logPath}  started=${room.startedAt}`);
      }
      for (const room of unconfirmed) {
        // Kept in the registry, not claimed live: the probe did not answer, and
        // "did not answer" is not permission to delete a room that may be
        // serving. Named so the reader knows what to re-check.
        console.log(
          `${room.id}  port=${room.port}  log=${room.logPath}  started=${room.startedAt}  did not answer — still registered`,
        );
      }
    },
  },

  "rooms history": {
    usage: "roomyx rooms history [flags]",
    summary: "rooms that have closed, newest first",
    notes:
      "History records what a room was and where its log is — it does not copy\n  the log. Reopen one read-only with `roomyx-client --open <logPath>`, or\n  pick from the list with `roomyx-client --archive`.",
    flags: { registry: REGISTRY_FLAG },
    run: async ({ flags }) => {
      const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
      const { rooms, unreadable } = readHistory(defaultHistoryPath(registryPath));
      if (rooms.length === 0) {
        console.log("No closed rooms recorded yet.");
      }
      for (const room of rooms) {
        const when = room.closedAt.slice(0, 16).replace("T", " ");
        const goal = room.goal === "" ? "(goal unavailable)" : room.goal;
        console.log(
          `${room.id}  closed=${when}  messages=${room.messages}  participants=${room.participants}  ${goal}`,
        );
        // The path on its own line: it is the argument to --open, and a goal
        // statement is long enough that putting them on one line means the
        // thing you have to copy is the thing that gets wrapped.
        console.log(`    ${room.logPath}${room.logExists ? "" : "  (log no longer at this path)"}`);
      }
      if (unreadable > 0) {
        console.log(`\n${unreadable} history line(s) could not be read and were skipped.`);
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
        const { createManagementMcpServer } = await import("./mcp-management/server");
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
  },

  "skills sync": {
    usage: "roomyx skills sync --target <runtime|all|path> [flags]",
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
