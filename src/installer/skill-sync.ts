import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

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
  /**
   * The target already holds exactly the bundled content, so there was nothing
   * to do. Distinct from `written: false`, which also covers a refusal — a
   * caller that cannot tell them apart prints "not written" at someone whose
   * file is perfectly up to date.
   */
  upToDate: boolean;
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

  // Byte-identical: do nothing, and say so.
  //
  // There was no such branch, so every `--yes` rewrote the file and left another
  // `.bak-<timestamp>` beside it even when not one character differed. Run on a
  // schedule, or after each release, that is a directory of identical backups
  // and a modification time that lies about when the skill last changed.
  //
  // The hash is still adopted, so a file roomyx did not write but that matches
  // what it would have written stops being "unrecorded content" — the next real
  // update then proceeds without a warning about hand edits that do not exist.
  // Adopted only under `yes`, because the CLI promises that without it nothing
  // is written, and the config is a file.
  if (targetContent === bundledContent) {
    if (options.dryRun !== true && options.yes === true && lastSyncedHash !== hashOf(bundledContent)) {
      writeConfig(options.configPath, {
        ...config,
        lastSyncedHashes: { ...config.lastSyncedHashes, [options.targetPath]: hashOf(bundledContent) },
      });
    }
    return { wouldWrite: false, written: false, backedUpTo: null, warnings: [], upToDate: true };
  }
  // Two distinct "don't touch this blindly" cases, both requiring --yes:
  // (a) we synced before and the target has since been hand-edited, or
  // (b) the target already existed with content we have no record of ever
  // having written — a bug found by an independent review: treating "no
  // recorded hash" as "safe to overwrite" silently clobbered pre-existing,
  // never-bundled content on the very first sync to a given target.
  const neverSyncedButPreExisting = targetExists && lastSyncedHash === undefined;
  const handEditedSinceLastSync =
    targetExists && lastSyncedHash !== undefined && hashOf(targetContent as string) !== lastSyncedHash;
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

  // Gated by default, and the default lives here rather than in each caller.
  // It used to be computed per surface, and the two surfaces disagreed: the CLI
  // did `dryRun = flags["dry-run"] === true || !yes`, while the MCP tool passed
  // both through as `undefined` — so a call carrying only `target` wrote a real
  // skill file over an unauthenticated loopback port, with no confirmation,
  // while the CLI's own help said "Without --yes nothing is written". D-02
  // exists to make landing on a real skill file a deliberate act; a default
  // computed twice is a default that will differ once.
  // `yes` now gates every write, not only a write over independent changes, so
  // the old second guard (`targetHasIndependentChanges && !options.yes`) is
  // subsumed: nothing reaches here without `yes: true`. The warnings above are
  // still built, so a refusal still says which target had unrecorded content.
  if (options.dryRun === true || options.yes !== true) {
    return { wouldWrite: true, written: false, backedUpTo: null, warnings, upToDate: false };
  }

  // ONE backup, at a fixed name, replaced each time.
  //
  // It used to be `.bak-<timestamp>`, which kept every version forever. Nobody
  // reads the fourth-oldest copy of a skill file; what a backup is for is
  // undoing the change that was just made. Combined with the identical-content
  // branch above, this file now always holds the last version that actually
  // differed — a no-op sync does not touch it.
  let backedUpTo: string | null = null;
  if (targetExists) {
    backedUpTo = `${options.targetPath}.bak`;
    copyFileSync(options.targetPath, backedUpTo);
  }

  // A named target's runtime may be installed without ever having had a
  // startup-room skill, so its directory need not exist. Same failure mode the
  // registry had: the write is ready for a missing file but not a missing
  // directory.
  mkdirSync(dirname(options.targetPath), { recursive: true });
  writeFileSync(options.targetPath, bundledContent);
  writeConfig(options.configPath, {
    ...config,
    lastSyncedHashes: { ...config.lastSyncedHashes, [options.targetPath]: hashOf(bundledContent) },
  });

  return { wouldWrite: true, written: true, backedUpTo, warnings, upToDate: false };
}
