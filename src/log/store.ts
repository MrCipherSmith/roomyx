import { readFileSync } from "node:fs";
import { messageLineSchema, stateLineSchema } from "./schema";
import type { AgentDetail, MessageEnvelope, RoomState, RosterEntry } from "./types";

/**
 * Reads the room log (see roomyx/README.md for the on-disk format) without
 * ever writing to it. The first line is the state header; every following
 * line is a message.
 */
export function loadRoomLog(path: string): { state: RoomState; messages: MessageEnvelope[] } {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error(`Room log at ${path} is empty; expected a state header line.`);
  }

  const [headerLine, ...rest] = lines as [string, ...string[]];
  const headerResult = stateLineSchema.safeParse(JSON.parse(headerLine));
  if (!headerResult.success) {
    throw new Error(
      `Room log at ${path} must start with a valid "state" line: ${headerResult.error.message}`,
    );
  }

  const state: RoomState = {
    goal_contract: headerResult.data.goal_contract,
    roster: headerResult.data.roster,
  };

  const messages: MessageEnvelope[] = rest.map((line, index) => {
    const result = messageLineSchema.safeParse(JSON.parse(line));
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
