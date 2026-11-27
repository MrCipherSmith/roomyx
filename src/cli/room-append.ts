import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findRoomServing, probeRoomState, listRoomsWithLiveness } from "../installer/registry";
import { appendMessages, LEGAL_KINDS } from "../log/write";
import type { AppendMessageOptions } from "../log/write";
import { isLeaseHolderAlive, readWriterLease, tombstoneWriterLease, writerLeasePathFor } from "../writer-lease";
import { MESSAGE_KINDS } from "../log/schema";
import { LogWriteError } from "../log/write";
import type { MessageEnvelope } from "../log/types";
import { ArgError } from "./args";
import type { FlagValues } from "./args";
import { REGISTRY_FLAG, defaultRegistryPath } from "./shared";
import type { Command } from "./shared";

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

const ENVELOPE_KEYS = ["from", "body", "kind", "in_reply_to", "change"] as const;

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
  const { from, body, kind, in_reply_to: inReplyTo, change } = envelope;
  if (typeof from !== "string" || from === "") throw new ArgError('--json needs a non-empty "from".');
  if (typeof body !== "string") throw new ArgError('--json needs a string "body".');
  if (kind !== undefined && (typeof kind !== "string" || !(MESSAGE_KINDS as readonly string[]).includes(kind))) {
    throw new ArgError(`--json "kind" must be one of: ${LEGAL_KINDS}.`);
  }
  if (inReplyTo !== undefined && (typeof inReplyTo !== "number" || !Number.isInteger(inReplyTo) || inReplyTo < 1)) {
    throw new ArgError('--json "in_reply_to" must be a whole number of at least 1.');
  }
  // The change is passed through unexamined here and validated where the rule
  // lives (the log's own schema, imported by the writer). Re-checking its shape
  // in the CLI would be a second copy of a rule the log already owns — and the
  // two copies would drift, which is the failure `src/log/schema.ts` exists to
  // make impossible.
  if (change !== undefined && (typeof change !== "object" || change === null)) {
    throw new ArgError('--json "change" must be an object.');
  }
  return {
    from,
    body,
    kind: kind as MessageEnvelope["kind"],
    inReplyTo: inReplyTo as number | undefined,
    change: change as MessageEnvelope["change"],
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
function stateBefore(lease: import("../writer-lease").LeaseState): { pid: number; at: number } | undefined {
  if (lease.held) return { pid: lease.lease.pid, at: lease.lease.at };
  // A stale lease still identifies the writer that stopped: recording it is the
  // difference between a log that says "someone took this over" and one that
  // says who from.
  //
  // `released` deliberately displaces nobody. The tombstone already records who
  // was taken over, and naming that pid again in a second take-over's trace
  // would report a writer being displaced twice.
  return lease.reason === "stale" ? { pid: lease.last.pid, at: lease.last.at } : undefined;
}

export const roomAppend: Command = {
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
    //
    // A held lease is only evidence while the process that wrote it exists. It
    // is a claim made by a pid, and checking that pid costs one signal — while
    // not checking it meant a lease left behind by a process that had already
    // gone refused every write for the whole stale window, naming a pid the
    // operator could look up and not find. Nothing that is not running can be
    // writing into this log, so this narrows what counts as a live writer
    // without widening what may write beside one.
    const liveHolder = lease.held && isLeaseHolderAlive(lease.lease.pid) ? lease.lease : undefined;
    const writerPresent = liveHolder !== undefined || dispatched === true;
    // A fresh lease whose holder is gone is NOT the "a writer stopped here"
    // case: that one is `stale`, and it still requires --take-over below. This
    // one is provably nobody, so it is allowed — said out loud on stderr
    // because a recorded lease that the CLI decides to disregard is exactly the
    // kind of thing that should not happen quietly.
    const abandonedHold = lease.held && liveHolder === undefined ? lease.lease : undefined;
    const writerWasThere = !writerPresent && !lease.held && lease.reason === "stale";

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
          // `liveHolder`, not `lease.held`: naming a pid is only useful if the
          // pid is findable, and an unfindable one is what made this message
          // untrustworthy.
          `${liveHolder === undefined ? " — the room reports a dispatcher attached" : ` — pid ${liveHolder.pid}`}. ` +
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

    // A live room, and no evidence of a writer — say so rather than drop it.
    //
    // `serving` was already computed for the refusal above and, when nothing
    // holds a lease, was silently discarded. That silence is wrong in exactly
    // the case that matters: an agent dispatcher runs `roomyx serve` and
    // writes with `roomyx room append`, a fresh process each time, so it
    // never holds a lease and the room never reports a dispatcher. Every
    // append into a room an agent is running therefore looks, from here, like
    // an append into an unattended log.
    //
    // A note, not a refusal: there is nothing here that can tell a dispatcher
    // from a stranger, so refusing would block the legitimate writer — which
    // was tried and reverted. The log itself is safe either way; `seq`
    // allocation is under a lock and that is tested. What is at risk is the
    // conversation reading as one when it was two, and a line on stderr is
    // what lets a second writer notice before adding to it.
    //
    // stderr, because stdout carries `Appended seq N from X` and is parsed.
    if (serving !== undefined && !writerPresent && !writerWasThere) {
      console.error(
        `Note: room ${serving.id} is serving ${absolute}. Nothing holds the writer lease, so this append is ` +
          `allowed — but roomyx cannot see whether an agent is dispatching that room. If one is, you are writing ` +
          `into a conversation it is also writing into.`,
      );
    }

    // A lease that is still inside its window but whose holder has exited. Not
    // a refusal — a dead process is not writing anything — but not silence
    // either: this is a writer that stopped without releasing, and the operator
    // should hear which pid it was.
    if (abandonedHold !== undefined) {
      console.error(
        `Note: the writer lease on ${absolute} names pid ${abandonedHold.pid}, which is no longer running. ` +
          `Nothing is writing into this log, so this append is allowed.`,
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
      // A tombstone, not a hold. The token is still replaced — that is what
      // stops a writer which was merely paused from refreshing the lease it
      // lost and writing beside whoever displaced it, and it is the whole
      // reason a take-over is not just a flag on the write. What it must not do
      // is claim the pen: this process exits within milliseconds and calls
      // `releaseWriterLease` nowhere, so a hold taken here is a hold nothing
      // ever gives back. Acquiring one turned each deliberate recovery into
      // thirty seconds of "a writer is live — pid <already exited>" followed by
      // a permanent demand to keep recovering.
      tombstoneWriterLease(leasePath, {
        pid: process.pid,
        ...(displaced === undefined ? {} : { takeOverFrom: displaced }),
      });
    }

    for (const message of written) console.log(`Appended seq ${message.seq} from ${message.from}.`);
  },
};
