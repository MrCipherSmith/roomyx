import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SKILL_RUNTIMES } from "./skill-targets";
import type { SkillRuntime } from "./skill-targets";

/**
 * What `roomyx init` offers to do, as data.
 *
 * Split from the screen that draws it and from the code that performs it,
 * because the interesting decisions are here — which boxes start ticked, what
 * is already done, what cannot be done and why — and none of them should need a
 * renderer to test. The picker draws this list; `init-apply` executes it.
 *
 * **Nothing here writes.** A plan is built, shown, edited by the operator, and
 * only then applied. That is what makes the interactive path satisfy D-02 more
 * honestly than a flag did: landing a real skill file is a person ticking a box
 * and pressing Enter, not a side effect of the mechanism existing.
 */

export type PlanItemKind = "skill" | "personas" | "logs" | "gitignore" | "mcp";

export interface PlanItem {
  readonly id: string;
  readonly kind: PlanItemKind;
  /** Heading this item is listed under. */
  readonly group: string;
  /**
   * Whether this lands on the machine or in the project.
   *
   * Carried as data rather than inferred from the group, because `roomyx setup`
   * selects on it: the group is what the row is printed under, and inferring a
   * behavioural rule from a display string is how the two drift apart.
   */
  readonly scope: "user" | "project";
  readonly label: string;
  /** Where it actually lands on disk. What `init-apply` acts on. */
  readonly path: string;
  /** How the path is shown, which may carry a short note the path itself must not. */
  readonly detail: string;
  /** Ticked when the picker opens. */
  selected: boolean;
  /** Set when the item is already satisfied — still listed, so the list is a complete picture. */
  readonly done?: string;
  /** For a skill item: which runtime, so `init-apply` does not have to parse the id. */
  readonly runtime?: SkillRuntime;
}

export const GROUP_USER = "Skill — every project on this machine";
export const GROUP_PROJECT = "Skill — this project only (travels with the repo)";
export const GROUP_PERSONAS = "Persona library — a room is cast from these";
export const GROUP_EXTRAS = "Also";

export interface PlanContext {
  cwd: string;
  /** How many files the bundled persona library holds, for the label. */
  personaFiles?: number;
  /** Injectable so the tests never look at the operator's real home directory. */
  exists?: (path: string) => boolean;
  /** Injectable so a test never writes into the operator's real home directory. */
  home?: string;
}

/**
 * The offer, in the order it is shown.
 *
 * Boxes start ticked where the answer is not really in doubt: a runtime that is
 * installed on this machine, a project that already has that runtime's
 * directory, a logs directory the config already points at. Everything else
 * starts unticked. The rule is that a default tick must never write somewhere
 * the operator would be surprised to find a file — being surprised by a file in
 * `~/.cursor` when Cursor is not installed is exactly that.
 */
export function buildPlan(context: PlanContext): PlanItem[] {
  const { cwd } = context;
  const exists = context.exists ?? existsSync;
  const home = context.home ?? homedir();
  const items: PlanItem[] = [];

  for (const runtime of SKILL_RUNTIMES) {
    const path = runtime.path(cwd, home);
    // Presence of the runtime's own directory, not of our skill: this decides
    // whether to *offer it ticked*, never whether to offer it at all. A runtime
    // installed after roomyx would otherwise be unreachable.
    const present = exists(runtime.marker(cwd, home));
    items.push({
      id: `skill:${runtime.name}`,
      kind: "skill",
      group: runtime.scope === "user" ? GROUP_USER : GROUP_PROJECT,
      scope: runtime.scope,
      label: runtime.label,
      path,
      detail: path,
      selected: present,
      done: exists(path) ? "replaces" : undefined,
      runtime,
    });
  }

  // Two scopes, the same shape as the skill rows above — and for the same
  // reason. A copy in the project travels with the repository and is what a
  // team shares; a copy under the home directory is there for every project on
  // the machine, including throwaway ones. The skill prefers the project copy
  // and falls back to the home one, which is the order every runtime already
  // uses for skills.
  const homeDir = home;
  const personaScopes: [string, string, string, boolean, "user" | "project"][] = [
    [
      "personas:user",
      "For every project",
      join(homeDir, ".roomyx", "personas"),
      // Not ticked by default. The project copy is the one the skill prefers and
      // the one that travels with the repo; a second copy under the home
      // directory is convenience, and 87 files appearing in a directory the
      // operator did not know existed is the surprise the tick rule forbids.
      false,
      "user",
    ],
    ["personas:project", "In this project", join(cwd, ".roomyx", "personas"), true, "project"],
  ];

  for (const [id, label, path, ticked, scope] of personaScopes) {
    items.push({
      id,
      kind: "personas",
      group: GROUP_PERSONAS,
      scope,
      label,
      path,
      // The file count belongs to the description of the target, not to
      // `done`. It lived in `done` for one release and made that field mean
      // two things — "already satisfied" and "here is how big this is" — so a
      // caller asking "is this already installed?" got "87 files" and read it
      // as yes. `roomyx setup` was that caller, and it silently stopped
      // ticking the library.
      detail: context.personaFiles === undefined ? path : `${path}  (${context.personaFiles} files)`,
      selected: ticked && !exists(path),
      done: exists(path) ? "already there — existing files are kept" : undefined,
    });
  }

  const logsDir = join(cwd, ".roomyx", "rooms", "logs");
  items.push({
    id: "logs",
    kind: "logs",
    group: GROUP_EXTRAS,
    scope: "project",
    label: "Room-log directory",
    path: logsDir,
    detail: logsDir,
    // `config.json` has named this directory since the first release and
    // nothing ever created it, so `roomyx room new .roomyx/rooms/logs/x.jsonl`
    // — the path the config itself points at — failed on a fresh project.
    selected: true,
    done: exists(logsDir) ? "already there" : undefined,
  });

  const isRepo = exists(join(cwd, ".git"));
  items.push({
    id: "gitignore",
    kind: "gitignore",
    group: GROUP_EXTRAS,
    scope: "project",
    label: "Ignore registry, lockfiles",
    path: join(cwd, ".gitignore"),
    // The registry holds pids and ports of processes on *this* machine, and the
    // lockfiles are transient. Room logs are deliberately not ignored: the
    // transcript is the point.
    // The path alone. The label already names exactly what gets ignored, which
    // is also how it says what does not: the room logs.
    detail: join(cwd, ".gitignore"),
    selected: isRepo,
    done: isRepo ? undefined : "not a git repository",
  });

  for (const [id, label, path] of mcpTargets(cwd)) {
    const runtimeDir = id === "mcp:claude" ? join(cwd, ".claude") : join(cwd, ".cursor");
    items.push({
      id,
      kind: "mcp",
      group: GROUP_EXTRAS,
      scope: "project",
      label,
      path,
      detail: path,
      // Only pre-ticked when that runtime is already used in this project.
      // Registering a server for an agent nobody here runs is clutter.
      selected: exists(runtimeDir) || exists(path),
      done: undefined,
    });
  }

  return items;
}

/** Project-scoped MCP config files, by runtime. */
function mcpTargets(cwd: string): [string, string, string][] {
  return [
    ["mcp:claude", "MCP server for Claude Code", join(cwd, ".mcp.json")],
    ["mcp:cursor", "MCP server for Cursor", join(cwd, ".cursor", "mcp.json")],
  ];
}

/** The items a plan would actually act on. */
export function selectedItems(items: readonly PlanItem[]): PlanItem[] {
  return items.filter((item) => item.selected);
}

/**
 * The rows that land on the machine rather than in a project — what
 * `roomyx setup` offers when there is no project to set up.
 */
export function machineItems(items: readonly PlanItem[]): PlanItem[] {
  return items.filter((item) => item.scope === "user");
}
