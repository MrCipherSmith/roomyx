import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { loadRoomLog } from "../log/store";

/**
 * The record of rooms that have closed.
 *
 * **It is an index, not an archive of copies.** The obvious shape for "save
 * closed rooms" is a folder under `.roomyx/` that the log gets copied into when
 * the room ends. That is the wrong shape here for one specific reason: the room
 * log is append-only and is the single source of truth for what was said
 * (D-01a). Copying it makes a second one. The moment a copy exists, an append
 * to the original — which `roomyx room append --force` still permits, and which
 * a dispatcher does routinely if the room is reopened — leaves two files that
 * disagree, with nothing recording which is current. A reader would have no way
 * to tell, and the wrong answer is silent.
 *
 * So what gets written here is *what the room was*: its id, where its log lives,
 * its goal, how many people and messages it had, when it started and closed.
 * The transcript itself stays exactly where the operator put it, still the only
 * copy. If they move or delete it, the entry says so rather than quietly
 * serving stale text from a shadow copy.
 *
 * Append-only JSONL, like the room log and for the same reason: a closing room
 * appends one line under no lock, and a concurrent reader sees whole lines.
 */

const historyEntrySchema = z.object({
  type: z.literal("room"),
  id: z.string().min(1),
  logPath: z.string().min(1),
  goal: z.string(),
  participants: z.number().int().min(0),
  messages: z.number().int().min(0),
  startedAt: z.string().min(1),
  closedAt: z.string().min(1),
});

export type RoomHistoryEntry = z.infer<typeof historyEntrySchema>;

/** A history entry plus whether the transcript it points at is still there. */
export interface RoomHistoryRow extends RoomHistoryEntry {
  logExists: boolean;
}

/** Sits next to the registry, because the two describe the same rooms at different times. */
export function defaultHistoryPath(registryPath: string): string {
  return join(dirname(registryPath), "history.jsonl");
}

/**
 * What a closed room's log says about itself. Never throws: this runs inside a
 * shutdown handler, and a room that cannot be summarised is still a room worth
 * recording. A log that has been deleted, or that has a malformed line, yields
 * an entry with an empty goal and zero counts rather than an exception that
 * takes the deregistration with it.
 */
function summarize(logPath: string): { goal: string; participants: number; messages: number } {
  try {
    const { state, messages } = loadRoomLog(logPath);
    return {
      goal: state.goal_contract.goal_statement,
      participants: state.roster.length,
      messages: messages.length,
    };
  } catch {
    return { goal: "", participants: 0, messages: 0 };
  }
}

/**
 * Records that a room has ended. Called from the shutdown path and from the
 * registry's prune, so a room that crashed without deregistering is still
 * remembered — the prune is the only moment anything notices it is gone.
 *
 * Both paths can fire for the same id (a slow shutdown pruned by a concurrent
 * `rooms list`), so `readHistory` deduplicates rather than this refusing to
 * append. Appending twice is cheap; taking a lock on a shutdown path to prevent
 * it is not.
 *
 * Swallows its own errors for the same reason `summarize` does. Failing to
 * write a convenience index must not be able to abort a shutdown that still has
 * a port to release and a registry entry to remove.
 */
export function archiveRoom(
  historyPath: string,
  room: { id: string; logPath: string; startedAt: string },
  closedAt: string = new Date().toISOString(),
): void {
  try {
    mkdirSync(dirname(historyPath), { recursive: true });
    const entry: RoomHistoryEntry = {
      type: "room",
      id: room.id,
      logPath: room.logPath,
      startedAt: room.startedAt,
      closedAt,
      ...summarize(room.logPath),
    };
    appendFileSync(historyPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Deliberately silent. See above.
  }
}

export interface History {
  rooms: RoomHistoryRow[];
  /** Lines that did not parse. Reported rather than thrown — see below. */
  unreadable: number;
}

/**
 * Every closed room, newest first, with duplicates collapsed.
 *
 * **A malformed line is skipped, not raised.** This is the opposite of what
 * `loadRoomLog` does with the room log, and the difference is deliberate: the
 * room log is the transcript, where a line that will not parse means the record
 * is damaged and reading past it would silently drop something someone said.
 * This file is an index that can be rebuilt from nothing, and one bad line here
 * must not be able to hide fifty good rooms. The count is returned so the
 * surfaces can say the file has damage rather than pretending it is clean.
 */
export function readHistory(historyPath: string, exists: (path: string) => boolean = existsSync): History {
  if (!existsSync(historyPath)) return { rooms: [], unreadable: 0 };

  const byId = new Map<string, RoomHistoryEntry>();
  let unreadable = 0;

  for (const line of readFileSync(historyPath, "utf8").replace(/^﻿/, "").split("\n")) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      unreadable += 1;
      continue;
    }
    const entry = historyEntrySchema.safeParse(parsed);
    if (!entry.success) {
      unreadable += 1;
      continue;
    }
    // Last write wins: the prune path and the shutdown path can both record the
    // same room, and the later one saw more of it.
    byId.set(entry.data.id, entry.data);
  }

  const rooms = [...byId.values()]
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
    .map((room) => ({ ...room, logExists: exists(room.logPath) }));

  return { rooms, unreadable };
}
