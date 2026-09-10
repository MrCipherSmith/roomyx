import { readFileSync } from "node:fs";
import { messageLineSchema, stateLineSchema } from "./schema";
import type { AgentDetail, MessageEnvelope, RoomState, RosterEntry } from "./types";

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
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
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
