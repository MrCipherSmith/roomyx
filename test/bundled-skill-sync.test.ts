import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL = readFileSync(join(import.meta.dir, "..", "src", "bundled-skills", "startup-room", "SKILL.md"), "utf8");
const SERVER = readFileSync(join(import.meta.dir, "..", "src", "server", "index.ts"), "utf8");

/**
 * The bundled skill is a shipped artefact of this package, and it had drifted
 * behind the server it drives.
 *
 * Measured before this test existed: the server had grown
 * `room.get_delta_for`, `room.get_pending_owner_commands` and
 * `room.ack_owner_command` — all three built specifically so a dispatcher would
 * use them — and the skill mentioned none of them. So every dispatcher
 * re-derived a delta the server already computed, and an owner command posted
 * from the TUI went into a queue nobody was told to read.
 *
 * Nothing failed. That is the point: a skill that is merely out of date still
 * produces a working room, just a worse one, so the drift is invisible until
 * someone complains about the symptom.
 */

/** Every `room.*` tool the server actually registers. */
function registeredTools(): string[] {
  return [...SERVER.matchAll(/^\s+"(room\.[a-z_.]+)",$/gm)].map((m) => m[1] as string).sort();
}

describe("the bundled skill and the room server", () => {
  test("the server registers the tools this test knows about", () => {
    // Guards the guard: if the extraction stops matching, every assertion below
    // passes vacuously.
    const tools = registeredTools();
    expect(tools.length).toBeGreaterThanOrEqual(7);
    expect(tools).toContain("room.get_state");
    expect(tools).toContain("room.get_delta_for");
  });

  test("every tool a dispatcher needs is named in the skill", () => {
    // Not every tool: `room.get_state` and `room.get_transcript` are the
    // client's, and a dispatcher has no reason to poll them. These four are the
    // ones a dispatcher must call, and each was missing at least once.
    for (const tool of [
      "room.get_delta_for",
      "room.post_owner_command",
      "room.get_pending_owner_commands",
      "room.ack_owner_command",
    ]) {
      expect(SKILL).toContain(tool);
    }
  });

  test("the skill does not tell a dispatcher to compose the delta by hand", () => {
    // The instruction that made the server-side computation pointless.
    expect(SKILL).not.toMatch(/Compose the delta:/);
  });

  test("the skill does not order a running commentary into the chat", () => {
    // The complaint that started this: the room was being retold in the
    // conversation while the owner already had it live in the TUI.
    expect(SKILL).not.toMatch(/Report to the session owner after essentially every/);
    expect(SKILL).toMatch(/Do not narrate the room into the chat/);
  });

  test("the skill tells the dispatcher to set the room up without asking again", () => {
    expect(SKILL).toMatch(/in one go, and do not stop to ask/);
  });

  test("the skill still describes the log it actually writes", () => {
    // The description said "markdown file" long after the log became JSONL —
    // and the description is the first thing any agent reads.
    const description = SKILL.slice(0, SKILL.indexOf("\n---", 4));
    expect(description).not.toContain("shared markdown file");
  });
});
