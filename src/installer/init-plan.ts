import { existsSync } from "node:fs";
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
export const GROUP_EXTRAS = "Also";

export interface PlanContext {
  cwd: string;
  /** How many files the bundled persona library holds, for the label. */
  personaFiles?: number;
  /** Injectable so the tests never look at the operator's real home directory. */
  exists?: (path: string) => boolean;
  /** Injectable for the same reason. */
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
  const items: PlanItem[] = [];

  for (const runtime of SKILL_RUNTIMES) {
    const path = runtime.path(cwd);
    // Presence of the runtime's own directory, not of our skill: this decides
    // whether to *offer it ticked*, never whether to offer it at all. A runtime
    // installed after roomyx would otherwise be unreachable.
    const present = exists(runtime.marker(cwd));
    items.push({
      id: `skill:${runtime.name}`,
      kind: "skill",
      group: runtime.scope === "user" ? GROUP_USER : GROUP_PROJECT,
      label: runtime.label,
      path,
      detail: path,
      selected: present,
      done: exists(path) ? "replaces" : undefined,
      runtime,
    });
  }

  const personasDir = join(cwd, ".roomyx", "personas");
  items.push({
    id: "personas",
    kind: "personas",
    group: GROUP_EXTRAS,
    label: "Persona library",
    path: personasDir,
    detail: personasDir,
    // A room is built out of these, and without them the skill has nothing to
    // cast. It lands in roomyx's own directory, so nobody is surprised to find
    // it, and existing files are never overwritten.
    selected: true,
    done: exists(personasDir)
      ? "already there — existing files are kept"
      : context.personaFiles === undefined
        ? undefined
        : `${context.personaFiles} files`,
  });

  const logsDir = join(cwd, ".roomyx", "rooms", "logs");
  items.push({
    id: "logs",
    kind: "logs",
    group: GROUP_EXTRAS,
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
