import { readFileSync } from "node:fs";
import type { AgentDetail, MessageEnvelope, RoomState, RosterEntry } from "./types";

interface StateLine {
  type: "state";
  goal_contract: RoomState["goal_contract"];
  roster: RosterEntry[];
}

interface MessageLine extends MessageEnvelope {
  type: "message";
}

type LogLine = StateLine | MessageLine;

/**
 * Reads the room log (see room-tui/README.md for the on-disk format) without
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
  const header = JSON.parse(headerLine) as LogLine;
  if (header.type !== "state") {
    throw new Error(`Room log at ${path} must start with a "state" line, got "${header.type}".`);
  }

  const state: RoomState = { goal_contract: header.goal_contract, roster: header.roster };

  const messages: MessageEnvelope[] = rest.map((line) => {
    const parsed = JSON.parse(line) as LogLine;
    if (parsed.type !== "message") {
      throw new Error(`Expected a "message" line, got "${parsed.type}".`);
    }
    const { type: _type, ...envelope } = parsed;
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
