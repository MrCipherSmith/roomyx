import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadRoomLog, getTranscript, getAgentDetail } from "../../src/log/store";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

describe("loadRoomLog", () => {
  test("parses the state header (goal contract + roster)", () => {
    const { state } = loadRoomLog(FIXTURE);
    expect(state.goal_contract.version).toBe(1);
    expect(state.goal_contract.goal_statement).toContain("room-tui MCP server MVP");
    expect(state.goal_contract.threshold).toEqual({ fail_below: 60, pass_at_or_above: 80 });
    expect(state.roster).toEqual([
      { id: "yuki", name: "Юки" },
      { id: "omar", name: "Омар" },
      { id: "zara", name: "Зара" },
    ]);
  });

  test("parses all message records in order", () => {
    const { messages } = loadRoomLog(FIXTURE);
    expect(messages).toHaveLength(4);
    expect(messages[0]).toMatchObject({ seq: 1, from: "yuki", kind: "pitch" });
    expect(messages[3]).toMatchObject({ seq: 4, from: "zara", kind: "status" });
  });

  test("does not mutate the log file on disk (AC4)", () => {
    const before = readFileSync(FIXTURE, "utf8");
    const beforeMtime = statSync(FIXTURE).mtimeMs;
    loadRoomLog(FIXTURE);
    const after = readFileSync(FIXTURE, "utf8");
    const afterMtime = statSync(FIXTURE).mtimeMs;
    expect(after).toBe(before);
    expect(afterMtime).toBe(beforeMtime);
  });
});

describe("getTranscript", () => {
  const { messages } = loadRoomLog(FIXTURE);

  test("since_seq: 0 returns the full transcript", () => {
    expect(getTranscript(messages, 0)).toHaveLength(4);
  });

  test("a mid-log since_seq returns only later messages, in order", () => {
    const result = getTranscript(messages, 2);
    expect(result.map((m) => m.seq)).toEqual([3, 4]);
  });

  test("since_seq at the log's last seq returns an empty array, not an error", () => {
    expect(getTranscript(messages, 4)).toEqual([]);
  });

  test("since_seq beyond the log's end returns an empty array, not an error", () => {
    expect(getTranscript(messages, 999)).toEqual([]);
  });
});

describe("getAgentDetail", () => {
  const { state, messages } = loadRoomLog(FIXTURE);

  test("known agent_id returns only that participant's messages and last-seen status", () => {
    const detail = getAgentDetail(messages, state.roster, "yuki");
    expect(detail.found).toBe(true);
    if (detail.found) {
      expect(detail.agent).toEqual({ id: "yuki", name: "Юки" });
      expect(detail.messages.map((m) => m.seq)).toEqual([1, 3]);
      expect(detail.lastSeenSeq).toBe(3);
    }
  });

  test("unknown agent_id returns an explicit not-found result, not a crash or empty success", () => {
    const detail = getAgentDetail(messages, state.roster, "nonexistent-agent");
    expect(detail.found).toBe(false);
  });
});
