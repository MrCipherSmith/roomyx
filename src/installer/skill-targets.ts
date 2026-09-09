import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The runtimes `roomyx skills sync --target` knows by name. Anything else the
 * flag is given is treated as a literal path, which is what the tests use —
 * D-02 requires the mechanism to be exercised against fixtures, never against
 * a real `~/.claude/skills/...` file.
 */
export const NAMED_TARGETS = ["claude", "codex", "keryx"] as const;

export type NamedSkillTarget = (typeof NAMED_TARGETS)[number];

export function isNamedTarget(value: string): value is NamedSkillTarget {
  return (NAMED_TARGETS as readonly string[]).includes(value);
}

/**
 * Where each runtime keeps the `startup-room` skill.
 *
 * Claude and Codex both scope skills to the user, under a home directory.
 * keryx scopes them to the project instead: `.metaproject/project-skills/` is
 * where a project's own skills live, as distinct from `.metaproject/skills/`,
 * which is keryx's own bundled set and not ours to write into.
 */
export function pathForNamedTarget(target: NamedSkillTarget, cwd: string = process.cwd()): string {
  switch (target) {
    case "claude":
      return join(homedir(), ".claude", "skills", "startup-room", "SKILL.md");
    case "codex":
      return join(homedir(), ".codex", "skills", "startup-room", "SKILL.md");
    case "keryx":
      return join(cwd, ".metaproject", "project-skills", "startup-room", "SKILL.md");
  }
}

/**
 * Turns whatever `--target` was given into concrete paths. `all` fans out to
 * every named runtime; a name resolves to that runtime's path; anything else
 * is passed through as a literal path.
 */
export function resolveTargets(
  target: string,
  cwd: string = process.cwd(),
): { name: string; path: string }[] {
  if (target === "all") {
    return NAMED_TARGETS.map((name) => ({ name, path: pathForNamedTarget(name, cwd) }));
  }
  if (isNamedTarget(target)) {
    return [{ name: target, path: pathForNamedTarget(target, cwd) }];
  }
  return [{ name: target, path: target }];
}
