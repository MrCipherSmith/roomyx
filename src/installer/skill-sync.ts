import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

export interface SyncOptions {
  bundledSkillPath: string;
  targetPath: string;
  /** .roomyx/config.json — stores the "last synced" hash per target path. */
  configPath: string;
  dryRun?: boolean;
  /** Required to proceed when the target has independent changes since the last sync. */
  yes?: boolean;
}

export interface SyncResult {
  wouldWrite: boolean;
  written: boolean;
  backedUpTo: string | null;
  warnings: string[];
}

function hashOf(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

interface SyncConfig {
  schemaVersion: number;
  lastSyncedHashes?: Record<string, string>;
  [key: string]: unknown;
}

function readConfig(configPath: string): SyncConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as SyncConfig;
}

function writeConfig(configPath: string, config: SyncConfig): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Diffs the bundled skill against a target path, backs up before
 * overwriting, and refuses to write without `yes: true` when the target has
 * been hand-edited since the last recorded sync (docs/requirements/
 * roomyx-installer/decisions.md D-02 — never silently discard hand edits).
 */
export function syncSkill(options: SyncOptions): SyncResult {
  const bundledContent = readFileSync(options.bundledSkillPath, "utf8");
  const config = readConfig(options.configPath);
  const lastSyncedHash = config.lastSyncedHashes?.[options.targetPath];

  const targetExists = existsSync(options.targetPath);
  const targetContent = targetExists ? readFileSync(options.targetPath, "utf8") : null;
  // Two distinct "don't touch this blindly" cases, both requiring --yes:
  // (a) we synced before and the target has since been hand-edited, or
  // (b) the target already existed with content we have no record of ever
  // having written — a bug found by an independent review: treating "no
  // recorded hash" as "safe to overwrite" silently clobbered pre-existing,
  // never-bundled content on the very first sync to a given target.
  const neverSyncedButPreExisting = targetExists && lastSyncedHash === undefined;
  const handEditedSinceLastSync =
    targetExists && lastSyncedHash !== undefined && hashOf(targetContent as string) !== lastSyncedHash;
  const targetHasIndependentChanges = neverSyncedButPreExisting || handEditedSinceLastSync;

  const warnings: string[] = [];
  if (neverSyncedButPreExisting) {
    warnings.push(
      `${options.targetPath} already exists but roomyx has never synced it before — refusing to overwrite unrecorded content without --yes.`,
    );
  } else if (handEditedSinceLastSync) {
    warnings.push(
      `${options.targetPath} has changed since the last sync (hand-edited?) — refusing to overwrite without --yes.`,
    );
  }

  if (options.dryRun) {
    return { wouldWrite: true, written: false, backedUpTo: null, warnings };
  }
  if (targetHasIndependentChanges && !options.yes) {
    return { wouldWrite: true, written: false, backedUpTo: null, warnings };
  }

  let backedUpTo: string | null = null;
  if (targetExists) {
    backedUpTo = `${options.targetPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(options.targetPath, backedUpTo);
  }

  writeFileSync(options.targetPath, bundledContent);
  writeConfig(options.configPath, {
    ...config,
    lastSyncedHashes: { ...config.lastSyncedHashes, [options.targetPath]: hashOf(bundledContent) },
  });

  return { wouldWrite: true, written: true, backedUpTo, warnings };
}
