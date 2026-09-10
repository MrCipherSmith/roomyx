import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlan, selectedItems, GROUP_EXTRAS, GROUP_PROJECT, GROUP_USER } from "../../src/installer/init-plan";
import { applyPlan } from "../../src/installer/init-apply";
import { SKILL_RUNTIMES, resolveTargets } from "../../src/installer/skill-targets";

const BUNDLED = join(import.meta.dir, "..", "fixtures", "bundled-skill.md");
const PERSONAS = join(import.meta.dir, "..", "..", "src", "bundled-personas");

let dir: string;
function tempDir(): string {
  dir = mkdtempSync(join(tmpdir(), "roomyx-init-"));
  return dir;
}
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** A config the sync can record hashes into, which is what `roomyx init` creates. */
function withConfig(root: string): string {
  const configPath = join(root, ".roomyx", "config.json");
  mkdirSync(join(root, ".roomyx"), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ schemaVersion: 1 }));
  return configPath;
}

describe("the runtime table", () => {
  test("covers the four agents that read a skills directory, at both scopes", () => {
    const names = SKILL_RUNTIMES.map((r) => r.name);
    for (const name of ["claude", "codex", "cursor", "grok"]) {
      expect(names).toContain(name);
      expect(names).toContain(`${name}-project`);
    }
    expect(names).toContain("keryx");
  });

  test("user scope resolves under home, project scope under the project — and they never collide", () => {
    const paths = resolveTargets("all", "/some/project");
    for (const { name, path } of paths) {
      const runtime = SKILL_RUNTIMES.find((r) => r.name === name)!;
      if (runtime.scope === "user") expect(path.startsWith(homedir())).toBe(true);
      else expect(path.startsWith("/some/project")).toBe(true);
    }
    // Nine rows, nine distinct files. A duplicate would mean one tick silently
    // overwriting another's target.
    expect(new Set(paths.map((p) => p.path)).size).toBe(paths.length);
  });
});

describe("what init offers", () => {
  test("a runtime that is not installed is offered, but not pre-ticked", () => {
    // Offered always, because a runtime installed *after* roomyx would
    // otherwise be permanently unreachable from the picker. Ticked only when
    // its directory is there, because a file appearing in ~/.cursor on a
    // machine without Cursor is exactly the surprise a default must not cause.
    const root = tempDir();
    const items = buildPlan({ cwd: root, exists: () => false });
    const skills = items.filter((i) => i.kind === "skill");
    expect(skills.length).toBe(SKILL_RUNTIMES.length);
    expect(skills.every((i) => !i.selected)).toBe(true);
  });

  test("a runtime whose directory exists here is pre-ticked", () => {
    const root = tempDir();
    mkdirSync(join(root, ".claude"), { recursive: true });
    const items = buildPlan({ cwd: root });
    const claudeProject = items.find((i) => i.id === "skill:claude-project")!;
    const cursorProject = items.find((i) => i.id === "skill:cursor-project")!;
    expect(claudeProject.selected).toBe(true);
    expect(cursorProject.selected).toBe(false);
  });

  test("an existing skill file is listed as replacing, not hidden", () => {
    // The list is a complete picture of what init can do, so an item that is
    // already satisfied still appears — with a note saying it will be backed up
    // rather than silently replaced.
    const root = tempDir();
    const target = join(root, ".claude", "skills", "startup-room", "SKILL.md");
    mkdirSync(join(root, ".claude", "skills", "startup-room"), { recursive: true });
    writeFileSync(target, "old");
    const item = buildPlan({ cwd: root }).find((i) => i.id === "skill:claude-project")!;
    expect(item.done).toBe("replaces");
    expect(item.detail).toBe(target);
  });

  test("the gitignore item is only ticked in a git repository", () => {
    const root = tempDir();
    expect(buildPlan({ cwd: root }).find((i) => i.kind === "gitignore")!.selected).toBe(false);
    mkdirSync(join(root, ".git"), { recursive: true });
    expect(buildPlan({ cwd: root }).find((i) => i.kind === "gitignore")!.selected).toBe(true);
  });

  test("the log directory is always ticked — the config has always named it and nothing created it", () => {
    const root = tempDir();
    const item = buildPlan({ cwd: root }).find((i) => i.kind === "logs")!;
    expect(item.selected).toBe(true);
    expect(item.path).toBe(join(root, ".roomyx", "rooms", "logs"));
  });

  test("items arrive grouped, in the order the groups are shown", () => {
    const root = tempDir();
    const groups = [...new Set(buildPlan({ cwd: root }).map((i) => i.group))];
    expect(groups).toEqual([GROUP_USER, GROUP_PROJECT, GROUP_EXTRAS]);
  });

  test("building a plan writes nothing at all", () => {
    // The property the whole design rests on: a plan is shown and edited before
    // anything happens.
    const root = tempDir();
    buildPlan({ cwd: root });
    expect(existsSync(join(root, ".roomyx"))).toBe(false);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
  });
});

describe("applying a plan", () => {
  test("installs a project-scoped skill where the item said it would", () => {
    const root = tempDir();
    const configPath = withConfig(root);
    mkdirSync(join(root, ".claude"), { recursive: true });
    const item = buildPlan({ cwd: root }).find((i) => i.id === "skill:claude-project")!;

    const [result] = applyPlan([item], { cwd: root, bundledSkillPath: BUNDLED, bundledPersonasPath: PERSONAS, configPath });
    expect(result?.ok).toBe(true);
    expect(existsSync(item.path)).toBe(true);
    expect(readFileSync(item.path, "utf8")).toBe(readFileSync(BUNDLED, "utf8"));
  });

  test("gitignore is appended to, never rewritten, and repeats do nothing", () => {
    const root = tempDir();
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "node_modules\n");
    const configPath = withConfig(root);
    const item = buildPlan({ cwd: root }).find((i) => i.kind === "gitignore")!;

    applyPlan([item], { cwd: root, bundledSkillPath: BUNDLED, bundledPersonasPath: PERSONAS, configPath });
    const once = readFileSync(join(root, ".gitignore"), "utf8");
    expect(once).toContain("node_modules");
    expect(once).toContain(".roomyx/rooms/registry.json");
    // The transcript is the artefact worth keeping. Ignoring the logs would be
    // the one genuinely destructive thing this item could do.
    expect(once).not.toContain(".roomyx/rooms/logs");

    const [second] = applyPlan([item], { cwd: root, bundledSkillPath: BUNDLED, bundledPersonasPath: PERSONAS, configPath });
    expect(second?.message).toBe("already covered");
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe(once);
  });

  test("registering the MCP server keeps every server already in the file", () => {
    const root = tempDir();
    const configPath = withConfig(root);
    writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2));
    const item = buildPlan({ cwd: root }).find((i) => i.id === "mcp:claude")!;

    applyPlan([item], { cwd: root, bundledSkillPath: BUNDLED, bundledPersonasPath: PERSONAS, configPath });
    const written = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, { command: string; args?: string[] }>;
    };
    expect(written.mcpServers.other).toEqual({ command: "x" });
    // stdio, not a URL: a registration written at init must not point at a port
    // nothing is listening on yet.
    expect(written.mcpServers.roomyx?.args).toEqual(["mcp", "--stdio"]);
  });

  test("an existing roomyx entry is left exactly as the operator set it", () => {
    const root = tempDir();
    const configPath = withConfig(root);
    const mine = { mcpServers: { roomyx: { command: "/opt/mine/roomyx", args: ["mcp", "--stdio"] } } };
    writeFileSync(join(root, ".mcp.json"), JSON.stringify(mine, null, 2));
    const item = buildPlan({ cwd: root }).find((i) => i.id === "mcp:claude")!;

    const [result] = applyPlan([item], { cwd: root, bundledSkillPath: BUNDLED, bundledPersonasPath: PERSONAS, configPath });
    expect(result?.message).toContain("already registered");
    expect(JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"))).toEqual(mine);
  });

  test("an MCP config that is not valid JSON is refused, not replaced", () => {
    const root = tempDir();
    const configPath = withConfig(root);
    writeFileSync(join(root, ".mcp.json"), "{ this is not json");
    const item = buildPlan({ cwd: root }).find((i) => i.id === "mcp:claude")!;

    const [result] = applyPlan([item], { cwd: root, bundledSkillPath: BUNDLED, bundledPersonasPath: PERSONAS, configPath });
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("Left untouched");
    expect(readFileSync(join(root, ".mcp.json"), "utf8")).toBe("{ this is not json");
  });

  test("one failing item does not cost the operator the rest of the submit", () => {
    const root = tempDir();
    const configPath = withConfig(root);
    writeFileSync(join(root, ".mcp.json"), "{ broken");
    mkdirSync(join(root, ".git"), { recursive: true });
    const plan = buildPlan({ cwd: root });
    const items = [plan.find((i) => i.id === "mcp:claude")!, plan.find((i) => i.kind === "logs")!];

    const results = applyPlan(items, { cwd: root, bundledSkillPath: BUNDLED, bundledPersonasPath: PERSONAS, configPath });
    expect(results[0]?.ok).toBe(false);
    expect(results[1]?.ok).toBe(true);
    expect(existsSync(join(root, ".roomyx", "rooms", "logs"))).toBe(true);
  });

  test("only ticked items are acted on", () => {
    const root = tempDir();
    const configPath = withConfig(root);
    const plan = buildPlan({ cwd: root });
    for (const item of plan) item.selected = false;

    expect(selectedItems(plan)).toHaveLength(0);
    applyPlan(selectedItems(plan), { cwd: root, bundledSkillPath: BUNDLED, bundledPersonasPath: PERSONAS, configPath });
    expect(existsSync(join(root, ".roomyx", "rooms", "logs"))).toBe(false);
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
  });
});
