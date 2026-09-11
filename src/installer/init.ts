import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { syncSkill } from "./skill-sync";

export interface InitOptions {
  cwd: string;
  bundledSkillPath: string;
}

export interface InitResult {
  /**
   * false only when the registry already lists at least one room. An existing
   * but empty `.roomyx` still reports as created — the comment here used to
   * claim otherwise, and `cli.ts` prints this straight to the operator.
   */
  created: boolean;
  roomyxDir: string;
  /**
   * Why the staged skill was left as it was, when it was. Empty or absent means
   * the sync had nothing to report — not that it did nothing.
   */
  skillWarnings?: string[];
}

const DEFAULT_CONFIG = {
  schemaVersion: 1,
  defaultPort: 4319,
  roomLogDir: ".roomyx/rooms/logs",
};

/**
 * Creates `.roomyx/` in `cwd`: config.json, an empty room registry, and a
 * staged copy of the bundled skill. Never overwrites an existing, non-empty
 * registry (D-01 in decisions.md: explicit, never-clobbering init).
 */
export function init(options: InitOptions): InitResult {
  const roomyxDir = join(options.cwd, ".roomyx");
  const registryPath = join(roomyxDir, "rooms", "registry.json");
  const configPath = join(roomyxDir, "config.json");
  const skillDir = join(roomyxDir, "skills", "startup-room");

  mkdirSync(join(roomyxDir, "rooms"), { recursive: true });
  mkdirSync(skillDir, { recursive: true });

  const registryAlreadyHasRooms =
    existsSync(registryPath) && (JSON.parse(readFileSync(registryPath, "utf8")).rooms?.length ?? 0) > 0;

  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
  if (!existsSync(registryPath)) {
    writeFileSync(registryPath, JSON.stringify({ schemaVersion: 1, rooms: [] }, null, 2));
  }
  // Staged through `syncSkill`, not copied.
  //
  // Three defects lived in the two lines this replaces. The copy was
  // unconditional — no hash check, no backup, no gate — which is the operation
  // `syncSkill` refuses outright, while the comment above promises "explicit,
  // never-clobbering": a second `roomyx init` silently discarded hand edits to
  // the staged copy. Guarding it with `existsSync` fixed the clobber and created
  // the opposite one: after a package upgrade the staged copy kept the old text
  // forever, silently. And `.roomyx/skills/` is read by nothing (`skills sync`
  // reads the bundled copy straight from the package), so a stale file there is
  // pure misinformation — it looks like the skill the project uses.
  //
  // `syncSkill` is what this wanted all along: a recorded hash per target, a
  // backup before any overwrite, and a refusal that says which target it is
  // refusing. `init` supplies `yes` itself, because the gate below is about
  // *when* to write, and the operator's consent to scaffolding was the command.
  const stagedSkill = join(skillDir, "SKILL.md");
  const syncOptions = {
    bundledSkillPath: options.bundledSkillPath,
    targetPath: stagedSkill,
    configPath,
  };

  // Asked before writing, so the decision is made from `syncSkill`'s own
  // verdict rather than from a second copy of its rules here.
  //
  // It *was* a second copy: this function re-read both files and compared them
  // itself to work out whether the staged copy was already the bundled skill.
  // `syncSkill` now answers that directly with `upToDate`, and asking it is the
  // only way the two cannot disagree — which they did, the moment `syncSkill`
  // learned to return early on identical content and stopped building the
  // warnings this code was reading to infer the same fact.
  const dryRun = syncSkill({ ...syncOptions, dryRun: true });

  if (dryRun.upToDate) {
    // Byte-identical, so there is nothing a refusal could protect. The call
    // records the hash and writes no file: the sync keys its records by
    // absolute path, so a moved project otherwise keeps this copy stale forever
    // and says so on every run.
    syncSkill({ ...syncOptions, yes: true });
    return { created: !registryAlreadyHasRooms, roomyxDir };
  }

  if (dryRun.warnings.length > 0) {
    // Ours to refresh only while it is still ours. A hand-edited or unrecorded
    // staged copy is left exactly as it is, and the caller is told why — the
    // silence was the defect, not the staleness.
    return { created: !registryAlreadyHasRooms, roomyxDir, skillWarnings: dryRun.warnings };
  }

  syncSkill({ ...syncOptions, yes: true });

  return { created: !registryAlreadyHasRooms, roomyxDir };
}
