import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendMessage, createRoomLog, LogWriteError } from "../../src/log/write";
import { loadRoomLog } from "../../src/log/store";
import { MESSAGE_KINDS } from "../../src/log/schema";

/**
 * The invariant: **anything the writer accepts, the reader must load.**
 *
 * It did not hold. `store.ts` validated with zod on read and `write.ts` had
 * only TypeScript types, which are erased at the CLI boundary where `--kind`
 * was cast with `as never`. So `roomyx room append --kind bogus-kind` exited 0,
 * wrote the line, and made every later read of that room throw — on an
 * append-only log with no repair command, which is a lost session rather than a
 * failed write.
 */

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function freshLog(): string {
  const dir = mkdtempSync(join(tmpdir(), "roomyx-write-contract-"));
  dirs.push(dir);
  const path = join(dir, "room.jsonl");
  createRoomLog(path, { goalStatement: "test the write contract", roster: [{ id: "a", name: "Ann" }] });
  return path;
}

function lineCount(path: string): number {
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).length;
}

describe("the room log's write contract", () => {
  test("every legal kind round-trips", () => {
    const path = freshLog();
    for (const kind of MESSAGE_KINDS) appendMessage(path, { from: "a", body: `a ${kind}`, kind });
    const { messages } = loadRoomLog(path);
    expect(messages).toHaveLength(MESSAGE_KINDS.length);
    expect(messages.map((m) => m.kind)).toEqual([...MESSAGE_KINDS]);
  });

  test("a kind the reader would refuse is refused by the writer, and nothing is written", () => {
    const path = freshLog();
    const before = lineCount(path);
    expect(() => appendMessage(path, { from: "a", body: "hello", kind: "bogus-kind" as never })).toThrow(LogWriteError);
    expect(lineCount(path)).toBe(before);
    // And the log is still readable, which is the whole point.
    expect(() => loadRoomLog(path)).not.toThrow();
  });

  test("in_reply_to below 1, or fractional, is refused rather than persisted", () => {
    const path = freshLog();
    for (const inReplyTo of [0, -1, 1.5]) {
      expect(() => appendMessage(path, { from: "a", body: "hello", inReplyTo })).toThrow(LogWriteError);
    }
    expect(lineCount(path)).toBe(1);
    expect(() => loadRoomLog(path)).not.toThrow();
  });

  test("an empty `from` is refused — the reader requires a non-empty one", () => {
    const path = freshLog();
    expect(() => appendMessage(path, { from: "", body: "hello" })).toThrow(LogWriteError);
    expect(lineCount(path)).toBe(1);
  });

  test("the refusal names the flag and the legal values, not a schema path", () => {
    const path = freshLog();
    try {
      appendMessage(path, { from: "a", body: "hello", kind: "note" as never });
      throw new Error("expected a refusal");
    } catch (error) {
      const message = String(error);
      expect(message).toContain("kind must be one of");
      for (const kind of MESSAGE_KINDS) expect(message).toContain(kind);
    }
  });

  test("whatever the writer accepts, the reader loads", () => {
    // The property, stated once. A future field added to one side and not the
    // other fails here rather than in someone's room.
    const path = freshLog();
    const accepted: Array<Parameters<typeof appendMessage>[1]> = [
      { from: "a", body: "plain" },
      { from: "a", body: "with kind", kind: "vote" },
      { from: "a", body: "with reply", inReplyTo: 1 },
      { from: "a", body: "with both", kind: "answer", inReplyTo: 2 },
      { from: "a", body: "" },
      { from: "a", body: "unicode ☃ 田中 ‮rtl" },
    ];
    for (const options of accepted) appendMessage(path, options);
    const { messages } = loadRoomLog(path);
    expect(messages).toHaveLength(accepted.length);
  });
});

describe("concurrent appends", () => {
  test("never allocate the same seq twice", async () => {
    // `nextSeq` reads the whole file and returns max+1, and nothing used to
    // stand between that and the append. Three writers racing a shared start
    // instant all got seq 1 and all three landed on disk. `seq` is the
    // transcript cursor, so a client polling between two colliding writes
    // advances past both and never receives the second message.
    const path = freshLog();
    const start = Date.now() + 800;
    const writers = Array.from({ length: 5 }, (_, i) =>
      Bun.spawn(
        [
          "bun",
          "-e",
          `import { appendMessage } from "${join(import.meta.dir, "..", "..", "src", "log", "write.ts")}";
           while (Date.now() < ${start}) {}
           console.log(appendMessage("${path}", { from: "a", body: "writer ${i}" }).seq);`,
        ],
        { stdout: "pipe", stderr: "pipe" },
      ),
    );

    const seqs = await Promise.all(
      writers.map(async (proc) => {
        const text = await new Response(proc.stdout).text();
        await proc.exited;
        return Number(text.trim());
      }),
    );

    expect(new Set(seqs).size).toBe(writers.length);

    // And on disk, which is what actually matters.
    const { messages } = loadRoomLog(path);
    expect(messages).toHaveLength(writers.length);
    expect(new Set(messages.map((m) => m.seq)).size).toBe(writers.length);
  }, 30000);
});
