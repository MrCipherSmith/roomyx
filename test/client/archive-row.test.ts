import { describe, expect, test } from "bun:test";
import { archiveRow } from "../../src/client/screens/archive-list";
import type { RoomHistoryRow } from "../../src/installer/history";

/**
 * The archive list is the second fixed-width list of single-line rows in this
 * client, and every rendering defect the first one shipped was width-dependent:
 * a 23-character name drew a completely blank row while `j`/`k` still moved onto
 * it. So this sweeps widths rather than checking one.
 */

function room(over: Partial<RoomHistoryRow> = {}): RoomHistoryRow {
  return {
    type: "room",
    id: "r-abc123",
    logPath: "/home/someone/rooms/review.jsonl",
    goal: "Decide whether the roomyx MCP server MVP is ready to review.",
    participants: 3,
    messages: 42,
    startedAt: "2026-09-09T09:00:00.000Z",
    closedAt: "2026-09-09T18:04:11.000Z",
    logExists: true,
    ...over,
  };
}

const WIDTHS = [0, 1, 2, 5, 10, 20, 36, 37, 38, 40, 60, 72, 80, 100, 120, 200];

describe("a row in the closed-rooms list", () => {
  test("never draws wider than the pane it is given, at any width", () => {
    for (const width of WIDTHS) {
      for (const selected of [true, false]) {
        for (const r of [room(), room({ logExists: false }), room({ goal: "" }), room({ goal: "x".repeat(400) })]) {
          const row = archiveRow(r, width, selected);
          expect(row.length).toBeLessThanOrEqual(Math.max(0, width - 1));
        }
      }
    }
  });

  test("says when the room closed, how much was said and who was there", () => {
    const row = archiveRow(room(), 120, false);
    expect(row).toContain("2026-09-09 18:04");
    expect(row).toContain("42 msg");
    expect(row).toContain("3 here");
    expect(row).toContain("ready to review");
  });

  test("a log that is no longer where the room left it says so", () => {
    // The whole reason this is an index and not a folder of copies: it can tell
    // you the transcript has moved. A shadow copy would have shown text that no
    // longer matches the file the reader thinks they are opening.
    expect(archiveRow(room({ logExists: false }), 200, false).startsWith("  ! ")).toBe(true);
    expect(archiveRow(room({ logExists: true }), 200, false).startsWith("    ")).toBe(true);
  });

  test("the missing-log marker survives truncation on a narrow pane", () => {
    // It sits before the goal for this reason: it decides whether Enter will
    // work at all, and a trailing marker is the first thing a 60-column pane
    // eats — leaving a dead row that looks exactly like a live one.
    for (const width of [8, 20, 30, 40, 50, 60, 72, 80, 120]) {
      expect(archiveRow(room({ logExists: false }), width, false).slice(0, 4)).toContain("!");
    }
  });

  test("a narrow pane spends the time-of-day columns on the goal instead", () => {
    const wide = archiveRow(room(), 120, false);
    const narrow = archiveRow(room(), 72, false);
    expect(wide).toContain("2026-09-09 18:04");
    expect(narrow).toContain("2026-09-09");
    expect(narrow).not.toContain("18:04");
    // The point of dropping it: more of the goal, not merely a shorter row.
    // Same pane width, six columns of timestamp traded for six of goal.
    const goalStart = (row: string) => row.indexOf("Decide");
    expect(goalStart(narrow)).toBe(goalStart(wide) - 6);
  });

  test("a room whose log could not be summarised says that, rather than showing a blank", () => {
    expect(archiveRow(room({ goal: "" }), 120, false)).toContain("(goal unavailable)");
  });

  test("the selected row is marked, and it is the only difference", () => {
    const selected = archiveRow(room(), 200, true);
    const plain = archiveRow(room(), 200, false);
    expect(selected.startsWith("> ")).toBe(true);
    expect(plain.startsWith("  ")).toBe(true);
    expect(selected.slice(2)).toBe(plain.slice(2));
  });

  test("the timestamp column does not shift when the counts change width", () => {
    // A list whose columns move as the numbers grow is unreadable at a glance,
    // and these numbers span one to four digits across a real history.
    const rows = [0, 1, 42, 1000, 99999, 12345678].map((messages) => archiveRow(room({ messages }), 200, false));
    const goalStart = rows.map((row) => row.indexOf("Decide whether"));
    expect(new Set(goalStart).size).toBe(1);
  });
});
