import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRoomLog } from "../../src/log/store";
import { appendMessage } from "../../src/log/write";
import { LogWriteError } from "../../src/log/write";

/**
 * A room's state lives in the first line and cannot be rewritten — the log is
 * append-only, and a second state line makes the room unreadable forever, because
 * `loadRoomLog` requires every line after the header to be a message. So an edit
 * has to be a message (D-20), and the reader folds them.
 *
 * This file pins the two halves that make that safe: a log with NO edits must
 * read exactly as it did before, and an edit that cannot be folded must not take
 * the room down with it.
 */

const HEADER = {
  type: "state",
  goal_contract: {
    version: 1,
    goal_statement: "Pick a database",
    criteria: "AC1-AC3",
    threshold: { fail_below: 60, pass_at_or_above: 80 },
  },
  roster: [{ id: "yuki", name: "Юки" }],
};

function logWith(extra: unknown[]): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "roomyx-fold-"));
  const path = join(dir, "room.jsonl");
  const lines = [JSON.stringify(HEADER), ...extra.map((m) => JSON.stringify(m))];
  writeFileSync(path, `${lines.join("\n")}\n`);
  return { path, dir };
}

const EDIT = (seq: number, threshold: number) => ({
  type: "message",
  seq,
  from: "owner",
  kind: "goal_edit",
  body: `raise the pass mark to ${threshold}`,
  change: {
    type: "goal_contract",
    goal_contract: { ...HEADER.goal_contract, threshold: { fail_below: 60, pass_at_or_above: threshold } },
  },
});

describe("a log with no edits reads exactly as it did before", () => {
  test("the header is the state", () => {
    const { path, dir } = logWith([{ type: "message", seq: 1, from: "yuki", body: "hello" }]);
    const { state, messages } = loadRoomLog(path);
    // The property that makes this whole change additive.
    expect(state.goal_contract.threshold.pass_at_or_above).toBe(80);
    expect(state.roster.map((r) => r.id)).toEqual(["yuki"]);
    expect(messages).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("an edit is folded into the state", () => {
  test("a goal_edit changes what get_state reports", () => {
    const { path, dir } = logWith([EDIT(1, 85)]);
    const { state } = loadRoomLog(path);
    // Before this, the room said one thing in its transcript and reported the
    // original contract — and since R12 the status bar shows that threshold.
    expect(state.goal_contract.threshold.pass_at_or_above).toBe(85);
    // The fields the schema has carried since the beginning with nothing writing
    // them.
    expect(state.goal_contract.updated_by).toBe("owner");
    rmSync(dir, { recursive: true, force: true });
  });

  test("two edits fold in seq order, and the later one wins", () => {
    const { path, dir } = logWith([EDIT(1, 85), { type: "message", seq: 2, from: "yuki", body: "ok" }, EDIT(3, 90)]);
    const { state } = loadRoomLog(path);
    expect(state.goal_contract.threshold.pass_at_or_above).toBe(90);
    rmSync(dir, { recursive: true, force: true });
  });

  test("an add_participant grows the roster", () => {
    const { path, dir } = logWith([
      {
        type: "message",
        seq: 1,
        from: "owner",
        kind: "add_participant",
        body: "adding Omar",
        change: { type: "roster", add: [{ id: "omar", name: "Омар" }] },
      },
    ]);
    const { state } = loadRoomLog(path);
    expect(state.roster.map((r) => r.id)).toEqual(["yuki", "omar"]);
    rmSync(dir, { recursive: true, force: true });
  });

  test("the edit is still an ordinary message in the transcript", () => {
    const { path, dir } = logWith([EDIT(1, 85)]);
    const { messages } = loadRoomLog(path);
    expect(messages.map((m) => m.kind)).toEqual(["goal_edit"]);
    expect(messages[0]?.body).toBe("raise the pass mark to 85");
    // The structure travels beside the body, so the pane never shows JSON.
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("an edit that cannot be folded does not take the room with it", () => {
  test("a goal_edit with no change is skipped, and the log still reads", () => {
    // Only reachable by hand-editing: the append path validates before writing.
    const { path, dir } = logWith([
      { type: "message", seq: 1, from: "owner", kind: "goal_edit", body: "I meant to edit this" },
      EDIT(2, 85),
    ]);
    const { state, messages } = loadRoomLog(path);
    expect(messages).toHaveLength(2);
    // Skipped, not applied, and the later legitimate edit still landed.
    expect(state.goal_contract.threshold.pass_at_or_above).toBe(85);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a change of the wrong type for its kind is refused by the writer", () => {
    // This is a SHAPE violation, not a fold rule, so it is refused where it is
    // written rather than quietly skipped where it is read: a change that does
    // not match its kind will never be applied by anything.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-fold-mismatch-"));
    const path = join(dir, "room.jsonl");
    writeFileSync(path, `${JSON.stringify(HEADER)}\n`);
    const before = readFileSync(path, "utf8");

    expect(() =>
      appendMessage(path, {
        from: "owner",
        body: "mismatched",
        kind: "goal_edit",
        change: { type: "roster", add: [{ id: "omar", name: "Омар" }] },
      }),
    ).toThrow(LogWriteError);
    expect(readFileSync(path, "utf8")).toBe(before);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a change on an ordinary message is refused too", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomyx-fold-ordinary-"));
    const path = join(dir, "room.jsonl");
    writeFileSync(path, `${JSON.stringify(HEADER)}\n`);
    expect(() =>
      appendMessage(path, {
        from: "yuki",
        body: "just a message",
        kind: "pitch",
        change: { type: "roster", add: [{ id: "omar", name: "Омар" }] },
      }),
    ).toThrow(LogWriteError);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("the write path refuses what the reader would skip", () => {
  test("a goal_edit with no change is a valid message that simply is not an edit", () => {
    // Deliberately NOT a schema violation. Making it one would mean an invalid
    // line, and an invalid line makes a room unreadable forever — so the rule
    // "this kind should carry a change" belongs to the fold, not to the shape.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-fold-write-"));
    const path = join(dir, "room.jsonl");
    writeFileSync(path, `${JSON.stringify(HEADER)}\n`);

    const written = appendMessage(path, { from: "owner", body: "no change attached", kind: "goal_edit" });
    expect(written.seq).toBe(1);
    // And it changed nothing: the fold ignores it, which the next test reads back.
    const { state } = loadRoomLog(path);
    expect(state.goal_contract.threshold.pass_at_or_above).toBe(80);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a message with no change at all still appends — the field is optional", () => {
    // Every message written by every earlier version must keep validating.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-fold-write2-"));
    const path = join(dir, "room.jsonl");
    writeFileSync(path, `${JSON.stringify(HEADER)}\n`);
    const written = appendMessage(path, { from: "yuki", body: "ordinary message" });
    expect(written.seq).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("folding never writes", () => {
  test("reading a log with edits leaves the file and its header untouched", () => {
    const { path, dir } = logWith([EDIT(1, 85)]);
    const before = readFileSync(path, "utf8");
    const beforeMtime = statSync(path).mtimeMs;

    const { state } = loadRoomLog(path);

    expect(state.goal_contract.threshold.pass_at_or_above).toBe(85);
    // The fold is an interpretation, not an edit: the header keeps the contract
    // the room was created with, and the log stays append-only byte for byte.
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(statSync(path).mtimeMs).toBe(beforeMtime);
    expect(JSON.parse(before.split("\n")[0] as string).goal_contract.threshold.pass_at_or_above).toBe(80);
    rmSync(dir, { recursive: true, force: true });
  });
});
