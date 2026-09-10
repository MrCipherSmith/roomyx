import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveRoom, defaultHistoryPath, readHistory } from "../../src/installer/history";
import { listLiveRooms } from "../../src/installer/registry";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let dir: string;

function tempDir(): string {
  dir = mkdtempSync(join(tmpdir(), "roomyx-history-"));
  return dir;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("the closed-room index", () => {
  test("records what the room was — its goal, its people and how much was said", () => {
    const root = tempDir();
    const logPath = join(root, "room.jsonl");
    copyFileSync(FIXTURE, logPath);
    const historyPath = join(root, "history.jsonl");

    archiveRoom(historyPath, { id: "r-aaa", logPath, startedAt: "2026-09-09T10:00:00.000Z" });

    const { rooms } = readHistory(historyPath);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.id).toBe("r-aaa");
    expect(rooms[0]?.goal).toBe("Decide whether the roomyx MCP server MVP is ready to review.");
    expect(rooms[0]?.participants).toBe(3);
    expect(rooms[0]?.messages).toBe(4);
    expect(rooms[0]?.logExists).toBe(true);
  });

  test("it stores a pointer, not a copy — the transcript is not duplicated anywhere", () => {
    // The design claim, asserted rather than left in a comment: a second copy of
    // an append-only log is a second source of truth, and an append to the
    // original would leave the two disagreeing with nothing recording which is
    // current.
    const root = tempDir();
    const logPath = join(root, "room.jsonl");
    copyFileSync(FIXTURE, logPath);
    const historyPath = join(root, "history.jsonl");

    archiveRoom(historyPath, { id: "r-aaa", logPath, startedAt: "2026-09-09T10:00:00.000Z" });

    const text = readFileSync(historyPath, "utf8");
    expect(text).not.toContain("Начнём с самого простого");
    expect(text).toContain(logPath);
    // One line for one room, not a transcript's worth.
    expect(text.trim().split("\n")).toHaveLength(1);
  });

  test("a room whose log is gone is still remembered, and says the log is gone", () => {
    const root = tempDir();
    const historyPath = join(root, "history.jsonl");

    archiveRoom(historyPath, {
      id: "r-bbb",
      logPath: join(root, "never-existed.jsonl"),
      startedAt: "2026-09-09T10:00:00.000Z",
    });

    const { rooms } = readHistory(historyPath);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.logExists).toBe(false);
    // Summarising failed, and that is not the same as the room not having
    // happened. The counts are honestly zero rather than the entry being absent.
    expect(rooms[0]?.goal).toBe("");
    expect(rooms[0]?.messages).toBe(0);
  });

  test("archiving never throws, whatever the log is — it runs inside a shutdown handler", () => {
    const root = tempDir();
    const logPath = join(root, "damaged.jsonl");
    writeFileSync(logPath, "this is not JSON at all\n");
    const historyPath = join(root, "history.jsonl");

    expect(() => archiveRoom(historyPath, { id: "r-ccc", logPath, startedAt: "x" })).not.toThrow();
    // Even an unwritable history path must not take the shutdown down with it.
    expect(() =>
      archiveRoom(join(root, "no", "such", "dir", "x", "\0bad"), { id: "r-ddd", logPath, startedAt: "x" }),
    ).not.toThrow();
    expect(readHistory(historyPath).rooms).toHaveLength(1);
  });

  test("the same room recorded twice appears once, with the later record winning", () => {
    // Both the shutdown path and the registry's prune can record one room: a
    // slow shutdown pruned by a concurrent `rooms list`. Deduplicating on read
    // is cheaper than taking a lock on a shutdown path to prevent it.
    const root = tempDir();
    const logPath = join(root, "room.jsonl");
    copyFileSync(FIXTURE, logPath);
    const historyPath = join(root, "history.jsonl");

    archiveRoom(historyPath, { id: "r-eee", logPath, startedAt: "s" }, "2026-09-09T10:00:00.000Z");
    archiveRoom(historyPath, { id: "r-eee", logPath, startedAt: "s" }, "2026-09-09T11:00:00.000Z");

    const { rooms } = readHistory(historyPath);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.closedAt).toBe("2026-09-09T11:00:00.000Z");
  });

  test("newest first", () => {
    const root = tempDir();
    const logPath = join(root, "room.jsonl");
    copyFileSync(FIXTURE, logPath);
    const historyPath = join(root, "history.jsonl");

    archiveRoom(historyPath, { id: "old", logPath, startedAt: "s" }, "2026-09-01T00:00:00.000Z");
    archiveRoom(historyPath, { id: "new", logPath, startedAt: "s" }, "2026-09-09T00:00:00.000Z");
    archiveRoom(historyPath, { id: "mid", logPath, startedAt: "s" }, "2026-09-05T00:00:00.000Z");

    expect(readHistory(historyPath).rooms.map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });

  test("one damaged line cannot hide the rooms around it", () => {
    // The opposite of what `loadRoomLog` does, on purpose. The room log is the
    // transcript, where reading past a bad line silently drops something someone
    // said. This file is an index that can be rebuilt from nothing, and one bad
    // line must not be able to make fifty good rooms unreachable.
    const root = tempDir();
    const logPath = join(root, "room.jsonl");
    copyFileSync(FIXTURE, logPath);
    const historyPath = join(root, "history.jsonl");

    archiveRoom(historyPath, { id: "before", logPath, startedAt: "s" }, "2026-09-01T00:00:00.000Z");
    appendFileSync(historyPath, "{ this is not json\n");
    appendFileSync(historyPath, JSON.stringify({ type: "room", id: "wrong-shape" }) + "\n");
    archiveRoom(historyPath, { id: "after", logPath, startedAt: "s" }, "2026-09-02T00:00:00.000Z");

    const { rooms, unreadable } = readHistory(historyPath);
    expect(rooms.map((r) => r.id)).toEqual(["after", "before"]);
    // Counted rather than swallowed: the surfaces say the file has damage
    // instead of presenting a partial list as a whole one.
    expect(unreadable).toBe(2);
  });

  test("no history file at all is an empty history, not an error", () => {
    const root = tempDir();
    expect(readHistory(join(root, "nothing.jsonl"))).toEqual({ rooms: [], unreadable: 0 });
  });

  test("it lives next to the registry — the two describe the same rooms at different times", () => {
    expect(defaultHistoryPath("/p/.roomyx/rooms/registry.json")).toBe("/p/.roomyx/rooms/history.jsonl");
  });
});

describe("a room that crashed without deregistering", () => {
  test("is archived by the prune, because that is the only moment anything notices it ended", async () => {
    // The more valuable half of the feature. A room that shut down cleanly is
    // easy to record; the rooms most worth being able to reread are the ones
    // that died — and until the prune noticed, nothing observed their ending at
    // all, so they left no trace anywhere.
    const root = tempDir();
    const logPath = join(root, "room.jsonl");
    copyFileSync(FIXTURE, logPath);
    const registryPath = join(root, "registry.json");
    const historyPath = defaultHistoryPath(registryPath);

    writeFileSync(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        // A pid nothing is using and a port nothing answers on: dead by both
        // checks, so no 500ms probe has to time out for the test to be true.
        rooms: [{ id: "r-crashed", port: 1, logPath, pid: 4194303, startedAt: "2026-09-09T09:00:00.000Z" }],
      }),
    );

    expect(await listLiveRooms(registryPath)).toHaveLength(0);

    const { rooms } = readHistory(historyPath);
    expect(rooms.map((r) => r.id)).toEqual(["r-crashed"]);
    expect(rooms[0]?.messages).toBe(4);
    expect(rooms[0]?.startedAt).toBe("2026-09-09T09:00:00.000Z");
  }, 15000);

  test("a prune that is asked not to prune does not archive either", async () => {
    // `prune: false` is the MCP surface, where "only reads" is meant exactly
    // rather than nearly. Archiving there would make a network call cause a
    // filesystem write, which is the property that option exists to hold.
    const root = tempDir();
    const logPath = join(root, "room.jsonl");
    copyFileSync(FIXTURE, logPath);
    const registryPath = join(root, "registry.json");

    writeFileSync(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        rooms: [{ id: "r-crashed", port: 1, logPath, pid: 4194303, startedAt: "s" }],
      }),
    );

    await listLiveRooms(registryPath, { prune: false });
    expect(readHistory(defaultHistoryPath(registryPath)).rooms).toHaveLength(0);
  }, 15000);
});
