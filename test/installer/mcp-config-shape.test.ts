import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlan } from "../../src/installer/init-plan";
import { applyPlan } from "../../src/installer/init-apply";

const BUNDLED = join(import.meta.dir, "..", "fixtures", "bundled-skill.md");
const PERSONAS = join(import.meta.dir, "..", "..", "src", "bundled-personas");

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** A project root whose `.mcp.json` already holds `content`. */
function rootWith(content: string): { root: string; configPath: string; mcpPath: string } {
  dir = mkdtempSync(join(tmpdir(), "roomyx-mcp-shape-"));
  const configPath = join(dir, ".roomyx", "config.json");
  mkdirSync(join(dir, ".roomyx"), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ schemaVersion: 1 }));
  const mcpPath = join(dir, ".mcp.json");
  writeFileSync(mcpPath, content);
  return { root: dir, configPath, mcpPath };
}

function registerRoomyx(root: string, configPath: string) {
  const item = buildPlan({ cwd: root }).find((i) => i.id === "mcp:claude");
  if (item === undefined) throw new Error("the plan no longer offers mcp:claude");
  return applyPlan([item], {
    cwd: root,
    bundledSkillPath: BUNDLED,
    bundledPersonasPath: PERSONAS,
    configPath,
  })[0];
}

/**
 * `JSON.parse(text) as McpConfig` is a promise the parser cannot keep (AC11).
 *
 * `ensureMcpServer` already refuses a file it cannot parse — "Left untouched",
 * because "a file we cannot parse may still be a file someone is relying on".
 * A file it CAN parse but that is not the shape it assumes gets no such
 * courtesy: the cast is the only check, so the very next lines read
 * `.mcpServers` off whatever came back and then write the result over the
 * operator's config.
 *
 * All three cases below were reproduced during the audit. None of them is a
 * hypothetical: `.mcp.json` is a hand-edited file in a shared project, and a
 * top-level array or a `mcpServers` set to a string is what a half-finished edit
 * or a bad merge leaves behind. What roomyx does with it is worse than what it
 * found.
 */
describe("an MCP config whose parsed shape is not an object", () => {
  test("a top-level array is refused with the same wording as unparseable JSON", () => {
    // Currently: `[1,2] as McpConfig` has no `mcpServers`, so the guard that
    // protects an existing `roomyx` entry never fires, the function sets a
    // property on the array, reports "registered" — and `JSON.stringify` drops
    // properties on arrays, so the registration it claims to have written is not
    // in the file. A success message about a write that did not happen.
    const { root, configPath, mcpPath } = rootWith("[1,2]");

    const result = registerRoomyx(root, configPath);

    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("Left untouched");
    expect(readFileSync(mcpPath, "utf8")).toBe("[1,2]");
  });

  test("a literal null is refused by name, not by TypeError", () => {
    // `JSON.parse("null")` is valid JSON and a legal `McpConfig` as far as the
    // cast is concerned, so `config.mcpServers` throws. `applyPlan` catches it,
    // which is why this looks handled — but the operator is shown a
    // `Cannot read properties of null` instead of a sentence naming their file
    // and saying it was left alone.
    const { root, configPath, mcpPath } = rootWith("null");

    const result = registerRoomyx(root, configPath);

    expect(result?.ok).toBe(false);
    expect(result?.message).toContain(mcpPath);
    expect(result?.message).toContain("Left untouched");
    expect(result?.message).not.toContain("Cannot read properties");
    expect(readFileSync(mcpPath, "utf8")).toBe("null");
  });

  test("an mcpServers that is a string is not spread character-by-character over the file", () => {
    // The worst of the three, because it succeeds. `{...\"notanobject\"}` is
    // `{\"0\":\"n\",\"1\":\"o\",...}`, so the file comes back with eleven
    // single-character server names in it and roomyx reports "registered".
    const original = '{"mcpServers":"notanobject"}';
    const { root, configPath, mcpPath } = rootWith(original);

    const result = registerRoomyx(root, configPath);

    expect(readFileSync(mcpPath, "utf8")).toBe(original);
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("Left untouched");
  });
});
