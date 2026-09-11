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

  test("the skill names the commands a dispatcher can actually run", () => {
    // It used to name the MCP tools directly, and nothing could reach them: no
    // CLI command exposed them, `.mcp.json` registers the management server
    // instead, and a room's own server binds an ephemeral port recorded only in
    // the registry. Naming the tool was an instruction that could not be
    // carried out; naming the command is one that can.
    for (const command of ["roomyx room delta", "roomyx room commands", "roomyx room ack"]) {
      expect(SKILL).toContain(command);
    }
  });

  test("each of those commands exists in the CLI", () => {
    // The half that catches the drift in the other direction: a skill naming a
    // command this package does not ship is the same defect wearing different
    // clothes.
    const cli = readFileSync(join(import.meta.dir, "..", "src", "cli.ts"), "utf8");
    for (const command of ["room delta", "room commands", "room ack"]) {
      expect(cli).toContain(`"${command}": {`);
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

describe("the skill's frontmatter against the published limits", () => {
  // https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
  // `name` ≤ 64 chars, lowercase/numbers/hyphens, no reserved words.
  // `description` ≤ 1024 chars, non-empty.
  const frontmatter = SKILL.slice(SKILL.indexOf("---") + 3, SKILL.indexOf("\n---", 4));
  const field = (key: string): string =>
    new RegExp(`^${key}:\\s*(.*)$`, "m").exec(frontmatter)?.[1] ?? "";

  test("description is within the 1024-character limit", () => {
    // It was 1162. Claude Code loaded it anyway, so nothing failed locally —
    // but the API's skill validation rejects over-long descriptions, which made
    // the skill quietly unportable. Asserted so it cannot drift back.
    const description = field("description");
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
  });

  test("description says what it does and when to use it, in third person", () => {
    const description = field("description");
    expect(description).toMatch(/\bUse when\b/);
    // "I can help you…" / "You can use this to…" are the two the guidance names
    // explicitly: the description is injected into a system prompt, and a
    // shifting point of view hurts discovery.
    expect(description).not.toMatch(/\b(I can|you can use this)\b/i);
  });

  test("description keeps the words someone would actually ask with", () => {
    const description = field("description").toLowerCase();
    for (const trigger of ["persona", "room", "debate", "brainstorm", "interview", "converge"]) {
      expect(description).toContain(trigger);
    }
  });

  test("name obeys the format rules, including the reserved words", () => {
    const name = field("name");
    expect(name).toMatch(/^[a-z0-9-]+$/);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).not.toMatch(/anthropic|claude/);
  });

  test("the body stays under 500 lines", () => {
    const body = SKILL.slice(SKILL.indexOf("\n---", 4) + 4);
    expect(body.split("\n").length).toBeLessThan(500);
  });
});
