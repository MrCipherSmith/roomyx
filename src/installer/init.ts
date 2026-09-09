import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  // Guarded like the config and the registry beside it. This copy used to be
  // unconditional — no hash check, no backup, no gate — which is the operation
  // `syncSkill` refuses outright, while this function's own comment promises
  // "explicit, never-clobbering". Re-running `roomyx init` silently discarded
  // hand edits to the staged copy.
  const stagedSkill = join(skillDir, "SKILL.md");
  if (!existsSync(stagedSkill)) copyFileSync(options.bundledSkillPath, stagedSkill);

  return { created: !registryAlreadyHasRooms, roomyxDir };
}
