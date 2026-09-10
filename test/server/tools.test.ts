import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStateTool } from "../../src/server/tools/get-state";
import { DEFAULT_TRANSCRIPT_LIMIT, getTranscriptTool } from "../../src/server/tools/get-transcript";
import { getAgentDetailTool } from "../../src/server/tools/get-agent-detail";
import { getAgentDeltaTool } from "../../src/server/tools/get-agent-delta";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

describe("room.get_state tool (AC1)", () => {
  test("returns the roster and current goal_contract from the log file", () => {
    const result = getStateTool(FIXTURE);
    expect(result.roster).toHaveLength(3);
    expect(result.goal_contract.version).toBe(1);
    expect(result.goal_contract.threshold.pass_at_or_above).toBe(80);
  });
});

/**
 * A throwaway log for cases the shared fixture cannot express — a participant
 * who never spoke, say. Written under a temp directory and removed by the
 * top-level `afterAll`, so a failure still cleans up.
 */
const tempDirs: string[] = [];
function logWith(
  messages: Array<{ seq: number; from: string; body: string }>,
  roster: Array<{ id: string; name: string }>,
): string {
  const dir = mkdtempSync(join(tmpdir(), "roomyx-tools-"));
  tempDirs.push(dir);
  const path = join(dir, "room.jsonl");
  const lines = [
    JSON.stringify({
      type: "state",
      goal_contract: {
        version: 1,
        goal_statement: "g",
        criteria: "",
        threshold: { fail_below: 60, pass_at_or_above: 80 },
      },
      roster,
    }),
    ...messages.map((m) => JSON.stringify({ type: "message", ...m })),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
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

describe("room.get_delta_for tool (D-18 item 5)", () => {
  /**
   * The per-turn arithmetic the dispatcher did by hand: "everything since your
   * last turn", which means everything after that participant's own last
   * message, excluding its own. The convention is not new — `getAgentDetail`
   * already computes `lastSeenSeq` as the max of an agent's own seq — it was
   * simply being re-derived in a model's context on every iteration.
   *
   * The fixture makes each case a different boundary:
   *   yuki  seq 1, 3   → default delta [4]
   *   omar  seq 2      → default delta [3, 4]
   *   zara  seq 4      → default delta []      (the empty case, which must be
   *                                             distinguishable from "no such agent")
   */
  test("the default delta is everything after its own last message", () => {
    const yuki = getAgentDeltaTool(FIXTURE, "yuki");
    expect(yuki.found).toBe(true);
    if (!yuki.found) return;
    expect(yuki.messages.map((m) => m.seq)).toEqual([4]);
    expect(yuki.since_seq).toBe(3);
  });

  test("a participant who never spoke gets the whole room", () => {
    // With no own message the convention's cursor is 0, which is the same answer
    // as "has seen nothing" — and that is the honest one.
    const path = logWith([{ seq: 1, from: "a", body: "first" }], [{ id: "quiet", name: "Quiet" }]);
    const quiet = getAgentDeltaTool(path, "quiet");
    expect(quiet.found).toBe(true);
    if (!quiet.found) return;
    expect(quiet.messages.map((m) => m.seq)).toEqual([1]);
    expect(quiet.since_seq).toBe(0);
  });

  test("it never contains the agent's own messages, at any cursor", () => {
    // An agent does not need to be told what it said. With an explicit 0 this is
    // the only rule doing the work: yuki's own seq 1 and 3 must not come back.
    const yuki = getAgentDeltaTool(FIXTURE, "yuki", 0);
    expect(yuki.found).toBe(true);
    if (!yuki.found) return;
    expect(yuki.messages.map((m) => m.seq)).toEqual([2, 4]);
    expect(yuki.messages.every((m) => m.from !== "yuki")).toBe(true);
  });

  test("the boundary excludes a message at exactly the cursor", () => {
    // The backlog's wording: a test fails when the delta "excludes a message at
    // seq equal to the agent's last own message". It does exclude it — that
    // message is its own — and this pins the boundary rather than the phrase.
    const omar = getAgentDeltaTool(FIXTURE, "omar", 3);
    expect(omar.found).toBe(true);
    if (!omar.found) return;
    // seq 3 is at the cursor and is not returned; seq 4 is after it and is.
    expect(omar.messages.map((m) => m.seq)).toEqual([4]);
  });

  test("an explicit since_seq overrides the default, and the answer says so", () => {
    const dflt = getAgentDeltaTool(FIXTURE, "yuki");
    const explicit = getAgentDeltaTool(FIXTURE, "yuki", 1);
    expect(dflt.found && dflt.messages.map((m) => m.seq)).toEqual([4]);
    expect(explicit.found && explicit.messages.map((m) => m.seq)).toEqual([2, 4]);

    // The two are told apart by the answer, not by the caller's memory.
    expect(dflt.found && dflt.cursor_from).toBe("agent-last-message");
    expect(explicit.found && explicit.cursor_from).toBe("caller");
    expect(explicit.found && explicit.since_seq).toBe(1);
  });

  test("a delta computed from the convention cannot be mistaken for one the caller set", () => {
    // Both cursors are 3 here, and the source still separates them.
    const byConvention = getAgentDeltaTool(FIXTURE, "yuki");
    const byCaller = getAgentDeltaTool(FIXTURE, "yuki", 3);
    expect(byConvention.found && byCaller.found).toBe(true);
    expect(byConvention.found && byConvention.since_seq).toBe(3);
    expect(byCaller.found && byCaller.since_seq).toBe(3);
    expect(byConvention.found && byConvention.cursor_from).toBe("agent-last-message");
    expect(byCaller.found && byCaller.cursor_from).toBe("caller");
  });

  test("an unknown participant is not-found, not an empty delta", () => {
    // An empty delta means "nothing new"; an unknown id means "no such person".
    // One answer for both tells a caller to wait for a participant who is not in
    // the room.
    const result = getAgentDeltaTool(FIXTURE, "nobody");
    expect(result.found).toBe(false);
    expect(result).not.toHaveProperty("messages");
  });

  test("the answer names its cursor and is not shaped like a delivery record", () => {
    // The server cannot see a SendMessage: it knows a convention about the log
    // and nothing else. So the answer says which cursor it used and where that
    // cursor came from, and carries no field that would imply knowledge it does
    // not have. The description's own wording is asserted on the wire, in
    // test/server/serve.test.ts, where a client can actually read it.
    const delta = getAgentDeltaTool(FIXTURE, "yuki");
    expect(delta.found).toBe(true);
    if (!delta.found) return;
    expect(Object.keys(delta).sort()).toEqual(["agent", "cursor_from", "found", "messages", "since_seq"]);
    for (const overclaim of ["delivered_at", "received_at", "delivered_to", "sent_at"]) {
      expect(delta).not.toHaveProperty(overclaim);
    }
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
    getAgentDeltaTool(FIXTURE, "yuki");

    const after = readFileSync(FIXTURE, "utf8");
    const afterMtime = statSync(FIXTURE).mtimeMs;
    expect(after).toBe(before);
    expect(afterMtime).toBe(beforeMtime);
  });
});
