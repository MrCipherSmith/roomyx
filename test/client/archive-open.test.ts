import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLIENT = join(import.meta.dir, "..", "..", "src", "client", "index.ts");
const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

/** The escape sequence that switches the terminal to the alternate screen. */
const ALTERNATE_SCREEN = "[?1049h";

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function run(args: string[]): { code: number; out: string; err: string } {
  const result = Bun.spawnSync(["bun", CLIENT, ...args]);
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}

describe("rereading a closed room", () => {
  test("a log that is not there fails as a sentence, without taking over the terminal", () => {
    // The ordering this pins: the log is loaded *before* the renderer starts.
    // Entering the alternate screen and then throwing leaves the person in a
    // terminal they have to `reset` out of, with the error scrolled away behind
    // it — and the most likely reason to reach this path at all is a history
    // entry whose transcript has since been moved.
    dir = mkdtempSync(join(tmpdir(), "roomyx-open-missing-"));
    const { code, out, err } = run(["--open", join(dir, "gone.jsonl")]);

    expect(code).toBe(1);
    expect(err).toContain("gone.jsonl");
    expect(out).not.toContain(ALTERNATE_SCREEN);
    expect(err).not.toContain(ALTERNATE_SCREEN);
  }, 15000);

  test("a damaged log names the file and the line, rather than throwing a bare SyntaxError", () => {
    // Same invariant the log fuzzer enforces on the reader: a refusal has to say
    // where. It is asserted again here because this is a new caller of
    // `loadRoomLog`, and the fuzzer only exercises the reader directly.
    dir = mkdtempSync(join(tmpdir(), "roomyx-open-damaged-"));
    const logPath = join(dir, "damaged.jsonl");
    writeFileSync(
      logPath,
      [
        '{"type":"state","goal_contract":{"version":1,"goal_statement":"g","criteria":"","threshold":{"fail_below":60,"pass_at_or_above":80}},"roster":[]}',
        '{"type":"message","seq":1,"from":"a","body":"fine"}',
        "{ not json",
        "",
      ].join("\n"),
    );

    const { code, err } = run(["--open", logPath]);
    expect(code).toBe(1);
    expect(err).toContain(logPath);
    expect(err).not.toBe("");
  }, 15000);

  test("--archive with nothing recorded says so in a sentence, not a full-screen empty list", () => {
    // A list you have to press q to leave, in order to be told it is empty, is
    // worse than a line of text.
    dir = mkdtempSync(join(tmpdir(), "roomyx-archive-empty-"));
    const { code, out } = run(["--archive", "--registry", join(dir, "registry.json")]);

    expect(code).toBe(0);
    expect(out).toContain("No closed rooms recorded yet.");
    expect(out).toContain("roomyx serve");
    expect(out).not.toContain(ALTERNATE_SCREEN);
  }, 15000);

  test("with no live room but rooms in history, the error points at the history", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-archive-hint-"));
    const registryPath = join(dir, "registry.json");
    writeFileSync(
      join(dir, "history.jsonl"),
      JSON.stringify({
        type: "room",
        id: "r-old",
        logPath: FIXTURE,
        goal: "g",
        participants: 3,
        messages: 4,
        startedAt: "2026-09-09T09:00:00.000Z",
        closedAt: "2026-09-09T18:00:00.000Z",
      }) + "\n",
    );

    const { code, err } = run(["--registry", registryPath]);
    expect(code).toBe(1);
    expect(err).toContain("No live roomyx rooms found");
    // The rooms that have ended are the other half of the answer, and the person
    // who just got "no live rooms" is usually looking for one of them.
    expect(err).toContain("--archive");
    expect(err).toContain("1 closed room(s)");
  }, 15000);
});
