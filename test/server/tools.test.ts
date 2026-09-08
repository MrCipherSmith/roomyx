import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getStateTool } from "../../src/server/tools/get-state";
import { getTranscriptTool } from "../../src/server/tools/get-transcript";
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
    expect(getTranscriptTool(FIXTURE, 0)).toHaveLength(4);
  });

  test("a mid-log since_seq returns only later messages, in order", () => {
    const result = getTranscriptTool(FIXTURE, 2);
    expect(result.map((m) => m.seq)).toEqual([3, 4]);
  });

  test("since_seq at or beyond the log's end returns an empty array, not an error", () => {
    expect(getTranscriptTool(FIXTURE, 4)).toEqual([]);
    expect(getTranscriptTool(FIXTURE, 999)).toEqual([]);
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
