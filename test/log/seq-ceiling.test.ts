import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendMessage, createRoomLog } from "../../src/log/write";
import { messageLineSchema } from "../../src/log/schema";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function freshLog(): string {
  const dir = mkdtempSync(join(tmpdir(), "roomyx-seq-ceiling-"));
  dirs.push(dir);
  const path = join(dir, "room.jsonl");
  createRoomLog(path, { goalStatement: "hold the seq ceiling", roster: [{ id: "a", name: "Ann" }] });
  return path;
}

/**
 * One line at the top of the number line kills the room, permanently.
 *
 * `seq: z.number().int().min(1)` has a floor and no ceiling, so
 * `Number.MAX_SAFE_INTEGER` is a legal recorded `seq`. `nextSeq` is `max + 1`,
 * which for that value is 9007199254740992 — outside the safe integer range, and
 * therefore refused by the very schema that admitted the line it was derived
 * from. Every append after it fails, with the same error, forever: the log is
 * append-only and there is no repair command.
 *
 * It is the same class as the `--kind bogus-kind` defect this module exists to
 * prevent — a value the writer's own reader cannot live with — except that here
 * the writer is what breaks rather than the reader, and a room that cannot be
 * written to is a lost session.
 */
describe("a recorded seq at the top of the safe range", () => {
  test("the ceiling value is accepted on read, so it can be in a log at all", () => {
    // Stated first, because it is the premise: nothing stops this line existing.
    // If a bound makes it invalid, the room becomes unreadable instead of
    // unwritable — a worse failure, and this case is what would catch it.
    const parsed = messageLineSchema.safeParse({
      type: "message",
      seq: Number.MAX_SAFE_INTEGER,
      from: "a",
      body: "at the ceiling",
    });
    expect(parsed.success).toBe(true);
  });

  test("a log carrying it stays writable", () => {
    const path = freshLog();
    appendMessage(path, { from: "a", body: "an ordinary first message" });
    // Crafted directly onto the file: a writer with an off-by-one, a merge of two
    // logs, or a hand-edit. The point is that the log now holds it.
    appendFileSync(
      path,
      JSON.stringify({ type: "message", seq: Number.MAX_SAFE_INTEGER, from: "a", body: "at the ceiling" }) + "\n",
    );

    const written = appendMessage(path, { from: "a", body: "the room is still usable" });
    // And the seq it allocated has to be one a reader can hold: MAX_SAFE + 1 is
    // not an integer JSON round-trips, which is how this became unwritable.
    expect(Number.isSafeInteger(written.seq)).toBe(true);
  });
});
