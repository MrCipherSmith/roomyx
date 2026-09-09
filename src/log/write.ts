import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { GoalContract, MessageEnvelope, RosterEntry } from "./types";

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

export function appendMessage(path: string, options: AppendMessageOptions): MessageEnvelope & { type: "message" } {
  if (!existsSync(path)) {
    throw new Error(`${path} does not exist. Create it with \`roomyx room new\` first.`);
  }
  const message: MessageEnvelope & { type: "message" } = {
    type: "message",
    seq: nextSeq(path),
    from: options.from,
    body: options.body,
    ...(options.kind ? { kind: options.kind } : {}),
    ...(options.inReplyTo !== undefined ? { in_reply_to: options.inReplyTo } : {}),
  };
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
