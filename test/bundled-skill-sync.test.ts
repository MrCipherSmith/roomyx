import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SKILL_DIR = join(import.meta.dir, "..", "src", "bundled-skills", "startup-room");
const SKILL = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
/** SKILL.md plus everything it points at — what actually gets installed. */
const BUNDLE = readdirSync(SKILL_DIR, { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".md"))
  .map((f) => readFileSync(join(SKILL_DIR, f), "utf8"))
  .join("\n");
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
      expect(BUNDLE).toContain(command);
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

  test("the skill states the nesting limit it depends on", () => {
    // Main → dispatcher → participants is two of the three layers a subagent
    // may spawn through. The next person to give participants their own helpers
    // lands on the boundary, where the spawn fails rather than queues — and
    // nothing in the skill said so until it did.
    expect(SKILL).toMatch(/three layers below the main conversation/);
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

describe("progressive disclosure", () => {
  test("every file SKILL.md points at exists", () => {
    // A pointer to a file that is not there is the `arena/roles/**` defect
    // again: an instruction an agent cannot follow, and one that fails silently
    // because the agent simply finds nothing and carries on.
    const links = [...SKILL.matchAll(/\]\((?!https?:)([^)]+\.md)\)/g)].map((m) => m[1] as string);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(existsSync(join(SKILL_DIR, link))).toBe(true);
      // Forward slashes, and one level deep: Claude may only partially read a
      // file reached through another reference.
      expect(link).not.toContain("\\");
      expect(link.split("/").length).toBeLessThanOrEqual(2);
    }
  });

  test("reference files do not point at further reference files", () => {
    for (const file of readdirSync(join(SKILL_DIR, "reference"))) {
      const text = readFileSync(join(SKILL_DIR, "reference", file), "utf8");
      expect([...text.matchAll(/\]\((?!https?:)([^)]+\.md)\)/g)]).toHaveLength(0);
    }
  });

  test("each reference file opens with a contents list", () => {
    // For anything over 100 lines the guidance asks for one, so a partial read
    // still shows the full scope of what is in the file.
    for (const file of readdirSync(join(SKILL_DIR, "reference"))) {
      expect(readFileSync(join(SKILL_DIR, "reference", file), "utf8")).toContain("## Contents");
    }
  });
});

describe("the persona library ships readable", () => {
  const PERSONAS = join(import.meta.dir, "..", "src", "bundled-personas");
  const files = readdirSync(PERSONAS, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".md"));
  const CYRILLIC = /[Ѐ-ӿ]/;

  test("the library is the size the skill says it is", () => {
    // The skill points readers at "fifty numbered interview personas, plus
    // founders/, tech/ and panel/, plus questionnaire-50.md". If that stops
    // being true the skill is lying to an agent that cannot check.
    expect(files.filter((f) => /^\d\d-.+\.md$/.test(f))).toHaveLength(50);
    expect(files).toContain("questionnaire-50.md");
    expect(files.length).toBeGreaterThanOrEqual(87);
  });

  test("no Russian survives except a persona's own name", () => {
    // The whole library shipped in Russian to a global registry for three
    // releases — an English reader followed English instructions into a library
    // they could not read. The names keep their Cyrillic deliberately, in
    // parentheses on the title line, so rooms run before the translation stay
    // findable by the names people already know.
    for (const file of files) {
      const [title, ...rest] = readFileSync(join(PERSONAS, file), "utf8").split("\n");
      expect(title).toBeDefined();
      const offending = rest.filter((line) => CYRILLIC.test(line));
      expect({ file, offending }).toEqual({ file, offending: [] });
    }
  });

  test("the questionnaire still has fifty questions", () => {
    // It is read to a character one question at a time; losing one to a
    // translation pass would be invisible until someone counted.
    const text = readFileSync(join(PERSONAS, "questionnaire-50.md"), "utf8");
    expect(text.split("\n").filter((l) => /^\d+\. /.test(l))).toHaveLength(50);
  });

  test("nothing points at the project this library came from", () => {
    // `arena/` is where the library lived before roomyx was extracted. Every
    // path into it is an instruction that cannot be followed, and they died
    // one narrow grep at a time: the skill's `arena/roles/**` went first, the
    // questionnaire's survived a release longer, and `groups.md` still held
    // three `arena/brainstorm/` and one `arena/reviews/` after a test that
    // only looked for `arena/roles` had declared the library clean.
    //
    // So this checks the prefix, not one path under it.
    for (const file of files) {
      expect({ file, text: readFileSync(join(PERSONAS, file), "utf8") }).toEqual({
        file,
        text: expect.not.stringContaining("arena/") as unknown as string,
      });
    }
    expect(BUNDLE).not.toContain("arena/");
  });
});
