import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { z } from "zod";
import { withLock } from "../lockfile";
import { MESSAGE_KINDS, messageLineSchema } from "./schema";
import type { GoalContract, MessageEnvelope, RosterEntry } from "./types";

/**
 * Thrown when a message would not survive its own reader. Separate from a
 * generic Error so the CLI can report it as a refusal rather than a crash.
 */
export class LogWriteError extends Error {}

/** The legal kinds, for an error message that says what to write instead. */
export const LEGAL_KINDS = MESSAGE_KINDS.join(", ");

function describeInvalid(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.join(".") || "message";
      if (field === "kind") return `kind must be one of: ${LEGAL_KINDS}`;
      if (field === "in_reply_to") return "in-reply-to must be a whole number of at least 1";
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}

/**
 * The write side of a room log, which `store.ts` reads.
 *
 * D-01 keeps one writer per *live* room. That constrains the server, not the
 * package — creating a log nobody is serving takes the writer count from zero
 * to one, and there is no race to lose. Appending to a log a dispatcher is
 * actively writing is the case that would break the invariant, so the CLI
 * checks the registry before doing it. See D-01a.
 */

export interface CreateRoomLogOptions {
  goalStatement: string;
  criteria?: string;
  roster: RosterEntry[];
  threshold?: GoalContract["threshold"];
}

export interface AppendMessageOptions {
  from: string;
  body: string;
  kind?: MessageEnvelope["kind"];
  inReplyTo?: number;
}

/** Refuses to overwrite: a room log is append-only, and clobbering one loses a session. */
export function createRoomLog(path: string, options: CreateRoomLogOptions): void {
  if (existsSync(path)) {
    throw new Error(`${path} already exists. A room log is append-only; refusing to overwrite it.`);
  }
  const goalContract: GoalContract = {
    version: 1,
    goal_statement: options.goalStatement,
    criteria: options.criteria ?? "",
    threshold: options.threshold ?? { fail_below: 60, pass_at_or_above: 80 },
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ type: "state", goal_contract: goalContract, roster: options.roster }) + "\n");
}

/** The next `seq`, derived from the log rather than tracked separately. */
export function nextSeq(path: string): number {
  if (!existsSync(path)) return 1;
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const seqs = lines.slice(1).map((line) => (JSON.parse(line) as { seq: number }).seq);
  return seqs.length > 0 ? Math.max(...seqs) + 1 : 1;
}

/**
 * Writes several messages as one unit: either every one of them lands with
 * consecutive `seq`, or none does.
 *
 * Half a batch is worse than a refused one. A dispatcher posting a turn's
 * messages gets no second chance to notice a gap — the log is append-only and
 * the transcript is read as the record of what was said, so a batch that wrote
 * its first two lines and rejected the third has silently dropped a turn from
 * the middle of a conversation.
 */
export function appendMessages(
  path: string,
  batch: AppendMessageOptions[],
): (MessageEnvelope & { type: "message" })[] {
  if (batch.length === 0) return [];
  return withLock(path, () => {
    if (!existsSync(path)) {
      throw new Error(`${path} does not exist. Create it with \`roomyx room new\` first.`);
    }
    // Allocated and validated as one set, before a single byte is written.
    const base = nextSeq(path);
    const built = batch.map((options, index) => buildMessage(base + index, options));
    for (const message of built) validate(message);
    for (const message of built) appendFileSync(path, JSON.stringify(message) + "\n");
    return built;
  });
}

export function appendMessage(path: string, options: AppendMessageOptions): MessageEnvelope & { type: "message" } {
  if (!existsSync(path)) {
    throw new Error(`${path} does not exist. Create it with \`roomyx room new\` first.`);
  }
  // Allocating `seq` and writing the line is one critical section, not two.
  // `nextSeq` reads the whole file and returns max+1, and nothing stood between
  // that and the append: three concurrent `roomyx room append` calls all
  // allocated `seq: 1` and all three landed on disk. `seq` is the transcript
  // cursor, so a client polling between two colliding writes advances past both
  // and never receives the second message — on disk, invisible in the TUI,
  // permanently.
  //
  // The registry has had this discipline for three rounds of review. The data
  // did not.
  return withLock(path, () => writeMessage(path, options));
}

function buildMessage(seq: number, options: AppendMessageOptions): MessageEnvelope & { type: "message" } {
  return {
    type: "message",
    seq,
    from: options.from,
    body: options.body,
    ...(options.kind ? { kind: options.kind } : {}),
    ...(options.inReplyTo !== undefined ? { in_reply_to: options.inReplyTo } : {}),
  };
}

function validate(message: MessageEnvelope & { type: "message" }): void {
  const parsed = messageLineSchema.safeParse(message);
  if (!parsed.success) throw new LogWriteError(describeInvalid(parsed.error));
}

function writeMessage(path: string, options: AppendMessageOptions): MessageEnvelope & { type: "message" } {
  const message: MessageEnvelope & { type: "message" } = {
    type: "message",
    seq: nextSeq(path),
    from: options.from,
    body: options.body,
    ...(options.kind ? { kind: options.kind } : {}),
    ...(options.inReplyTo !== undefined ? { in_reply_to: options.inReplyTo } : {}),
  };

  // Validated against the reader's own schema, before the write rather than
  // after it. The log is append-only and roomyx ships no repair command, so a
  // line the reader refuses is not a failed write — it is a room nobody can
  // open again. Types alone did not hold this: they are erased at the CLI
  // boundary, where `--kind` arrived as an unchecked string.
  validate(message);
  appendFileSync(path, JSON.stringify(message) + "\n");
  return message;
}

/** `id:Name,id2:Name2` — the shape the CLI takes and the log stores. */
export function parseRoster(spec: string): RosterEntry[] {
  return spec
    .split(",")
    .filter(Boolean)
    .map((pair) => {
      const [id, name] = pair.split(":");
      return { id: id ?? "", name: name ?? id ?? "" };
    });
}
