import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where each agent runtime looks for skills, as a table rather than a switch.
 *
 * Adding a runtime is one row. It used to be a `case` in one function plus a
 * literal in a union plus a line of prose, and the three had already drifted —
 * `grok` was missing entirely even though it reads `~/.claude/skills` and has
 * its own `~/.grok/skills`, so the only way to install for it was to type a
 * full path by hand.
 *
 * **Two scopes, deliberately both offered.** A user-scoped skill is available in
 * every project on the machine; a project-scoped one lives in the repository and
 * travels with it, which is what a team wants and what every one of these
 * runtimes ranks *higher* than the user-scoped copy. Neither is the right
 * default for everyone, so `roomyx init` asks instead of choosing.
 */

export interface SkillRuntime {
  /** The `--target` name. */
  readonly name: string;
  /** How to say it to a person. */
  readonly label: string;
  readonly scope: "user" | "project";
  /** Where the SKILL.md goes. */
  readonly path: (cwd: string) => string;
  /**
   * The directory whose existence means this runtime is in use here. Used only
   * to pre-tick sensible boxes in `roomyx init` — never to refuse a target,
   * because a runtime installed after roomyx would then be unreachable.
   */
  readonly marker: (cwd: string) => string;
}

const SKILL_FILE = ["skills", "startup-room", "SKILL.md"] as const;

function userRuntime(name: string, label: string, dir: string): SkillRuntime {
  return {
    name,
    label,
    scope: "user",
    path: () => join(homedir(), dir, ...SKILL_FILE),
    marker: () => join(homedir(), dir),
  };
}

function projectRuntime(name: string, label: string, dir: string): SkillRuntime {
  return {
    name,
    label,
    scope: "project",
    path: (cwd) => join(cwd, dir, ...SKILL_FILE),
    marker: (cwd) => join(cwd, dir),
  };
}

export const SKILL_RUNTIMES: readonly SkillRuntime[] = [
  userRuntime("claude", "Claude Code", ".claude"),
  userRuntime("codex", "Codex", ".codex"),
  userRuntime("cursor", "Cursor", ".cursor"),
  userRuntime("grok", "Grok", ".grok"),
  projectRuntime("claude-project", "Claude Code", ".claude"),
  projectRuntime("codex-project", "Codex", ".codex"),
  projectRuntime("cursor-project", "Cursor", ".cursor"),
  projectRuntime("grok-project", "Grok", ".grok"),
  {
    // keryx keeps a project's own skills in `.metaproject/project-skills/`, as
    // distinct from `.metaproject/skills/`, which is keryx's own bundled set and
    // not ours to write into. It has no user-scoped location, so there is one
    // row rather than two, and the name has no `-project` suffix because there
    // is nothing to distinguish it from.
    name: "keryx",
    label: "keryx",
    scope: "project",
    path: (cwd) => join(cwd, ".metaproject", "project-skills", "startup-room", "SKILL.md"),
    marker: (cwd) => join(cwd, ".metaproject"),
  },
];

export const NAMED_TARGETS = SKILL_RUNTIMES.map((runtime) => runtime.name) as readonly string[];

export type NamedSkillTarget = string;

export function isNamedTarget(value: string): boolean {
  return NAMED_TARGETS.includes(value);
}

export function runtimeByName(name: string): SkillRuntime | undefined {
  return SKILL_RUNTIMES.find((runtime) => runtime.name === name);
}

/** True when this runtime looks like it is actually in use here. */
export function isRuntimePresent(runtime: SkillRuntime, cwd: string = process.cwd()): boolean {
  return existsSync(runtime.marker(cwd));
}

export function pathForNamedTarget(target: string, cwd: string = process.cwd()): string {
  const runtime = runtimeByName(target);
  if (runtime === undefined) throw new Error(`Unknown skill target "${target}".`);
  return runtime.path(cwd);
}

/**
 * Turns whatever `--target` was given into concrete paths. `all` fans out to
 * every runtime in the table; a name resolves to that runtime's path; anything
 * else is passed through as a literal path.
 *
 * `all` genuinely means all, and that widened when the table grew from three
 * rows to nine — a caller who typed `all` before now reaches Cursor, Grok and
 * the project-scoped locations too. That is a change to what an existing flag
 * does without the caller asking, so it ships in the minor position (D-13),
 * not quietly in a patch.
 */
export function resolveTargets(target: string, cwd: string = process.cwd()): { name: string; path: string }[] {
  if (target === "all") {
    return SKILL_RUNTIMES.map((runtime) => ({ name: runtime.name, path: runtime.path(cwd) }));
  }
  const runtime = runtimeByName(target);
  if (runtime) return [{ name: runtime.name, path: runtime.path(cwd) }];
  return [{ name: target, path: target }];
}
