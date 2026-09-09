import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { NAMED_TARGETS, isNamedTarget, pathForNamedTarget, resolveTargets } from "../../src/installer/skill-targets";

describe("skill targets", () => {
  test("claude and codex resolve under the home directory", () => {
    expect(pathForNamedTarget("claude")).toBe(join(homedir(), ".claude", "skills", "startup-room", "SKILL.md"));
    expect(pathForNamedTarget("codex")).toBe(join(homedir(), ".codex", "skills", "startup-room", "SKILL.md"));
  });

  test("keryx resolves project-locally, under project-skills rather than keryx's own bundled skills", () => {
    const path = pathForNamedTarget("keryx", "/some/project");
    expect(path).toBe(join("/some/project", ".metaproject", "project-skills", "startup-room", "SKILL.md"));
    expect(path).not.toContain(join(".metaproject", "skills"));
  });

  test("`all` fans out to every named runtime, once each", () => {
    const resolved = resolveTargets("all", "/p");
    expect(resolved.map((r) => r.name)).toEqual([...NAMED_TARGETS]);
    expect(new Set(resolved.map((r) => r.path)).size).toBe(NAMED_TARGETS.length);
  });

  test("anything that is not a known name passes through as a literal path", () => {
    expect(isNamedTarget("/tmp/whatever.md")).toBe(false);
    expect(resolveTargets("/tmp/whatever.md")).toEqual([{ name: "/tmp/whatever.md", path: "/tmp/whatever.md" }]);
  });
});
