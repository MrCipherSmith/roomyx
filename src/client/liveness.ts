import type { ConnectionStatus } from "./mcp-client";

/**
 * What the footer says about whether the room is alive.
 *
 * The rule came out of the review room, and it overturned both of the opening
 * positions. A permanent `[connected]` chip is not read after the first
 * minute — a word that has always said the same thing stops being a signal,
 * which is exactly why a dead room looked like a live one: the header differed
 * by a single word in the same ink. Removing the chip outright was no better,
 * because it leaves a slot nobody has ever seen occupied.
 *
 * So: print a fact that *moves*. A message count and the age of the last
 * message. When the number stops, the silence finally means something, and it
 * means it without anyone having to notice a word change.
 *
 * Pure on purpose — it takes the current time rather than reading a clock, so
 * the wording is testable without a renderer, a server or a fake timer.
 */
export interface LivenessInput {
  status: ConnectionStatus;
  messageCount: number;
  /** Epoch ms of the last message that arrived, or null if none has. */
  lastMessageAt: number | null;
  now: number;
}

export function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

export function livenessLine(input: LivenessInput): string {
  const { status, messageCount, lastMessageAt, now } = input;
  const age = lastMessageAt === null ? null : Math.max(0, Math.floor((now - lastMessageAt) / 1000));

  if (status === "disconnected") {
    // The one state that must not be quiet. It leads, it names itself, and it
    // carries the age so the reader can tell a room that just dropped from one
    // that has been dead for ten minutes.
    return age === null ? "DISCONNECTED — retrying" : `DISCONNECTED — retrying · last message ${formatAge(age)} ago`;
  }

  if (status === "connecting") return "connecting…";

  if (messageCount === 0) {
    // Not trouble — unproven. A person watching a healthy room seconds after
    // starting it concluded "it hung", and they were wrong. Say what is being
    // waited for.
    return "connected · waiting for the first message";
  }

  const plural = messageCount === 1 ? "message" : "messages";
  return age === null ? `${messageCount} ${plural}` : `${messageCount} ${plural} · last ${formatAge(age)} ago`;
}
