import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStateTool } from "../../src/server/tools/get-state";
import { DEFAULT_TRANSCRIPT_LIMIT, getTranscriptTool } from "../../src/server/tools/get-transcript";
import { getAgentDetailTool } from "../../src/server/tools/get-agent-detail";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

describe("room.get_state tool (AC1)", () => {
  test("returns the roster and current goal_contract from the log file", () => {
    const result = getStateTool(FIXTURE);
    expect(result.roster).toHaveLength(3);
    expect(result.goal_contract.version).toBe(1);
    expect(result.goal_contract.threshold.pass_at_or_above).toBe(80);
  });
});

describe("room.get_transcript tool (AC2)", () => {
  test("since_seq: 0 returns the full transcript", () => {
    expect(getTranscriptTool(FIXTURE, 0).messages).toHaveLength(4);
  });

  test("a mid-log since_seq returns only later messages, in order", () => {
    const result = getTranscriptTool(FIXTURE, 2);
    expect(result.messages.map((m) => m.seq)).toEqual([3, 4]);
  });

  test("since_seq at or beyond the log's end returns no messages, not an error", () => {
    expect(getTranscriptTool(FIXTURE, 4).messages).toEqual([]);
    expect(getTranscriptTool(FIXTURE, 999).messages).toEqual([]);
  });
});

describe("room.get_transcript pages (R10)", () => {
  /**
   * A cold attach at `since_seq: 0` used to ship the whole transcript as one
   * text block — 3.8 MB in the room the backlog measured. The consumer on the
   * management path is a language model, so that is not 20 ms of CPU, it is a
   * context window. The result carries `has_more` and `next_seq` so a caller can
   * tell a complete answer from a page: a truncated list that looks complete is
   * the defect this project keeps re-filing.
   */
  function logWith(count: number): string {
    const dir = mkdtempSync(join(tmpdir(), "roomyx-transcript-"));
    const path = join(dir, "room.jsonl");
    const lines = [
      JSON.stringify({
        type: "state",
        goal_contract: { version: 1, goal_statement: "g", criteria: "", threshold: { fail_below: 60, pass_at_or_above: 80 } },
        roster: [{ id: "a", name: "Ann" }],
      }),
      ...Array.from({ length: count }, (_, i) =>
        JSON.stringify({ type: "message", seq: i + 1, from: "a", body: `message ${i + 1}` }),
      ),
    ];
    writeFileSync(path, `${lines.join("\n")}\n`);
    paths.push(dir);
    return path;
  }
  const paths: string[] = [];
  afterAll(() => {
    for (const dir of paths) rmSync(dir, { recursive: true, force: true });
  });

  test("an explicit limit returns at most that many, and says there are more", () => {
    const log = logWith(10);
    const page = getTranscriptTool(log, 0, 3);
    expect(page.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(page.has_more).toBe(true);
    // The cursor for the next call, so the caller does not re-derive it from the
    // last message it happened to receive.
    expect(page.next_seq).toBe(3);
  });

  test("the page after the cursor continues exactly where the last one stopped", () => {
    const log = logWith(10);
    const first = getTranscriptTool(log, 0, 4);
    const second = getTranscriptTool(log, first.next_seq, 4);
    expect(second.messages.map((m) => m.seq)).toEqual([5, 6, 7, 8]);
    expect(second.has_more).toBe(true);
    const third = getTranscriptTool(log, second.next_seq, 4);
    expect(third.messages.map((m) => m.seq)).toEqual([9, 10]);
    expect(third.has_more).toBe(false);
  });

  test("a page that reaches the end says so", () => {
    const log = logWith(3);
    const page = getTranscriptTool(log, 0, 50);
    expect(page.messages).toHaveLength(3);
    expect(page.has_more).toBe(false);
    expect(page.next_seq).toBe(3);
  });

  test("the default is bounded, so a cold attach cannot ask for the whole room", () => {
    // The victim is a caller who passes only `since_seq`, which is every caller
    // that existed before this change. Without a default they are all still
    // shipping the whole transcript.
    const log = logWith(DEFAULT_TRANSCRIPT_LIMIT + 25);
    const page = getTranscriptTool(log, 0);
    expect(page.messages).toHaveLength(DEFAULT_TRANSCRIPT_LIMIT);
    expect(page.has_more).toBe(true);
  });

  test("a limit of zero returns nothing and still reports the cursor honestly", () => {
    const log = logWith(3);
    const page = getTranscriptTool(log, 0, 0);
    expect(page.messages).toEqual([]);
    expect(page.has_more).toBe(true);
    // No message was returned, so the cursor cannot advance past anything —
    // advancing it would skip seq 1 forever.
    expect(page.next_seq).toBe(0);
  });
});

describe("room.get_agent_detail tool (AC3)", () => {
  test("known agent_id returns only that participant's messages and status", () => {
    const detail = getAgentDetailTool(FIXTURE, "omar");
    expect(detail.found).toBe(true);
    if (detail.found) {
      expect(detail.agent.name).toBe("Омар");
      expect(detail.messages.map((m) => m.seq)).toEqual([2]);
    }
  });

  test("unknown agent_id returns an explicit not-found result", () => {
    const detail = getAgentDetailTool(FIXTURE, "nonexistent-agent");
    expect(detail.found).toBe(false);
  });
});

describe("no tool writes to the room log (AC4)", () => {
  test("file content and mtime are unchanged after calling all three tools", () => {
    const before = readFileSync(FIXTURE, "utf8");
    const beforeMtime = statSync(FIXTURE).mtimeMs;

    getStateTool(FIXTURE);
    getTranscriptTool(FIXTURE, 0);
    getAgentDetailTool(FIXTURE, "yuki");

    const after = readFileSync(FIXTURE, "utf8");
    const afterMtime = statSync(FIXTURE).mtimeMs;
    expect(after).toBe(before);
    expect(afterMtime).toBe(beforeMtime);
  });
});
