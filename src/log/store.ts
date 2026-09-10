import { readFileSync } from "node:fs";
import { messageLineSchema, stateLineSchema } from "./schema";
import type { AgentDelta, AgentDetail, MessageEnvelope, RoomState, RosterEntry } from "./types";

/**
 * `JSON.parse`, with the one thing it never says: where.
 *
 * A line that is not valid JSON used to throw a bare `SyntaxError: Unexpected
 * token` — no path, no line number — from inside a function whose whole purpose
 * is to say `Invalid "message" line 12 in /path/room.jsonl`. Found by fuzzing:
 * of two thousand damaged logs, every unparseable one refused without naming
 * the file it had refused.
 */
function parseLine(text: string, describe: () => string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${describe()}: not valid JSON — ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Reads the room log (see roomyx/README.md for the on-disk format) without
 * ever writing to it. The first line is the state header; every following
 * line is a message.
 */
export function loadRoomLog(path: string): { state: RoomState; messages: MessageEnvelope[] } {
  // Editors add a byte-order mark; it is not part of the JSON and it made the
  // first line unparseable, which made the whole room unreadable.
  let raw: string;
  try {
    raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  } catch (error) {
    // A sentence, not a stack. Every other failure in this function names the
    // file and says what is wrong with it; "no such file" was the one that
    // escaped as a raw ENOENT with a stack trace, and it is the most ordinary
    // mistake there is \u2014 a typo in a path, or a log that has been moved.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No room log at ${path}. Create one with \`roomyx room new ${path} --goal "\u2026"\`.`);
    }
    throw new Error(`Cannot read room log at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error(`Room log at ${path} is empty; expected a state header line.`);
  }

  const [headerLine, ...rest] = lines as [string, ...string[]];
  const headerResult = stateLineSchema.safeParse(
    parseLine(headerLine, () => `Room log at ${path} must start with a valid "state" line`),
  );
  if (!headerResult.success) {
    throw new Error(
      `Room log at ${path} must start with a valid "state" line: ${headerResult.error.message}`,
    );
  }

  const state: RoomState = {
    goal_contract: headerResult.data.goal_contract,
    roster: headerResult.data.roster,
    // The reader knows which file it read; the state header does not carry it.
    log_path: path,
  };

  const messages: MessageEnvelope[] = rest.map((line, index) => {
    const result = messageLineSchema.safeParse(
      parseLine(line, () => `Invalid "message" line ${index + 2} in ${path}`),
    );
    if (!result.success) {
      // +2: 1-indexed lines, plus the header line already consumed.
      throw new Error(`Invalid "message" line ${index + 2} in ${path}: ${result.error.message}`);
    }
    const { type: _type, ...envelope } = result.data;
    return envelope;
  });

  return { state, messages };
}

/** Messages with seq strictly greater than sinceSeq, in log order. */
export function getTranscript(messages: MessageEnvelope[], sinceSeq: number): MessageEnvelope[] {
  return messages.filter((m) => m.seq > sinceSeq);
}

/** A single participant's messages and last-seen seq, or an explicit not-found result. */
export function getAgentDetail(
  messages: MessageEnvelope[],
  roster: RosterEntry[],
  agentId: string,
): AgentDetail {
  const agent = roster.find((r) => r.id === agentId);
  if (!agent) {
    return { found: false };
  }

  const own = messages.filter((m) => m.from === agentId);
  const lastSeenSeq = own.length > 0 ? Math.max(...own.map((m) => m.seq)) : 0;
  return { found: true, agent, messages: own, lastSeenSeq };
}

/**
 * The messages a participant has not seen, and the cursor that says so.
 *
 * This is the arithmetic the dispatcher re-derived in its own context on every
 * turn — the phrase in the bundled skill is "everything since your last turn" —
 * moved into the server that already knows how to compute it: `getAgentDetail`
 * has always reported `lastSeenSeq` as the maximum of an agent's own `seq`.
 *
 * Two rules, and the second is the one that survives an explicit cursor:
 *
 * 1. The default cursor is that maximum, and the delta is `seq > cursor`.
 * 2. Its own messages are excluded **at any cursor** — an agent does not need to
 *    be told what it said. With `sinceSeq: 0` this is the only rule doing work.
 *
 * Stateless on purpose. A cursor the server stored would belong to one server
 * instance, and `serveMcpOverHttp` builds one per session (the lesson flow 005
 * paid for); deriving it from the log on every call is what makes the answer
 * shareable without any state at all.
 *
 * **What this is not:** a record of what was delivered. The convention is a
 * good guess at what a participant has not seen, and a dispatcher may have
 * failed to send a delta or sent one twice. `cursor_from` names which cursor was
 * used so the guess is visible rather than implied.
 */
export function getAgentDelta(
  messages: MessageEnvelope[],
  roster: RosterEntry[],
  agentId: string,
  sinceSeq?: number,
): AgentDelta {
  const agent = roster.find((r) => r.id === agentId);
  if (!agent) return { found: false };

  const own = messages.filter((m) => m.from === agentId);
  const lastOwnSeq = own.length > 0 ? Math.max(...own.map((m) => m.seq)) : 0;
  const since = sinceSeq ?? lastOwnSeq;

  return {
    found: true,
    agent,
    messages: messages.filter((m) => m.seq > since && m.from !== agentId),
    since_seq: since,
    cursor_from: sinceSeq === undefined ? "agent-last-message" : "caller",
  };
}
