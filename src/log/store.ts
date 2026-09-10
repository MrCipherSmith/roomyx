import { readFileSync } from "node:fs";
import { messageLineSchema, stateLineSchema } from "./schema";
import type { MessageChange } from "./schema";
import type { AgentDelta, AgentDetail, GoalContract, MessageEnvelope, RoomState, RosterEntry } from "./types";

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

  const state: RoomState = {
    // The header is the room's ORIGINAL contract and the base every edit is
    // applied to; it is never reinterpreted as one of them.
    ...foldEdits({ goal_contract: headerResult.data.goal_contract, roster: headerResult.data.roster }, messages),
    // The reader knows which file it read; the state header does not carry it.
    log_path: path,
  };

  return { state, messages };
}

/**
 * A room's current state, from its original state and every edit since.
 *
 * The reason this exists at all: a room's state lives in the first line and that
 * line cannot be rewritten (append-only) and cannot be followed by a second one
 * (`loadRoomLog` requires every following line to be a message, so a second state
 * line makes the room unreadable forever). D-19 therefore makes an edit a
 * *message* — which also puts it in the transcript, where this project already
 * puts state changes so a person can see what happened.
 *
 * In `seq` order, last edit wins. A message whose kind is an edit kind but which
 * carries no change is not an edit and is skipped: it is a valid message that
 * happens to be tagged, and the schema deliberately does not make it invalid,
 * because an invalid line would kill the room.
 *
 * Nothing here writes. The fold is an interpretation of an append-only log, and
 * the header keeps the contract the room was created with.
 */
export function foldEdits(
  base: { goal_contract: GoalContract; roster: RosterEntry[] },
  messages: MessageEnvelope[],
): { goal_contract: GoalContract; roster: RosterEntry[] } {
  let goalContract = base.goal_contract;
  let roster = base.roster;

  for (const message of [...messages].sort((a, b) => a.seq - b.seq)) {
    const change: MessageChange | undefined = message.change;
    if (change === undefined) continue;
    if (change.type === "goal_contract") {
      goalContract = {
        ...change.goal_contract,
        // The schema has carried these since the beginning with nothing writing
        // them; an edit is exactly what they were designed for.
        updated_by: "owner",
        updated_in_round: message.seq,
      };
      continue;
    }
    // "add", not "set": the roster grows, and replacing it would silently drop
    // everyone an earlier message had introduced.
    const known = new Set(roster.map((entry) => entry.id));
    roster = [...roster, ...change.add.filter((entry) => !known.has(entry.id))];
  }

  return { goal_contract: goalContract, roster };
}

/** Messages with seq strictly greater than sinceSeq, in log order. */
export function getTranscript(messages: MessageEnvelope[], sinceSeq: number): MessageEnvelope[] {
  return messages.filter((m) => m.seq > sinceSeq);
}


/**
 * The agent's own last `seq`, or 0 when it has never spoken.
 *
 * Extracted because two functions now need this rule and it is a *rule*, not an
 * expression: "what counts as the agent's own last message" is the convention
 * both `get_agent_detail` and `getAgentDelta` publish, and computing it twice
 * means a change to it has to be made twice — which is how the two would come to
 * disagree about what a participant has seen, silently, since both answers look
 * plausible on their own.
 */
function lastOwnSeq(messages: MessageEnvelope[], agentId: string): number {
  const own = messages.filter((m) => m.from === agentId);
  return own.length > 0 ? Math.max(...own.map((m) => m.seq)) : 0;
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
  return { found: true, agent, messages: own, lastSeenSeq: lastOwnSeq(messages, agentId) };
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

  const since = sinceSeq ?? lastOwnSeq(messages, agentId);

  return {
    found: true,
    agent,
    messages: messages.filter((m) => m.seq > since && m.from !== agentId),
    since_seq: since,
    cursor_from: sinceSeq === undefined ? "agent-last-message" : "caller",
  };
}
