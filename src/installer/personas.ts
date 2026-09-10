import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Installs the bundled persona library into a project.
 *
 * The library is what a room is made of: fifty interview personas, plus
 * founder, technical and panel roles, plus a fifty-question interview
 * questionnaire. Until now these lived only in the project roomyx was extracted
 * from, and the skill still pointed at that project's path — so the skill
 * installed anywhere else sent an agent looking for personas at an address that
 * did not exist, and a room had nothing to be built out of.
 *
 * **Existing files are skipped, not overwritten.** A persona is a file people
 * edit — that is the point of shipping them as markdown rather than as data —
 * and an install that silently reverted someone's edits would be the same theft
 * D-02 exists to prevent. `force` overwrites, and moves the whole directory
 * aside first rather than merging: one rename is cheap and reversible, where
 * eighty-seven individual backups are noise.
 */

export interface PersonaInstallResult {
  readonly targetDir: string;
  /** Files copied. */
  readonly written: number;
  /** Files already present and left exactly as they were. */
  readonly skipped: number;
  /** Where the previous directory went, when `force` moved one aside. */
  readonly movedAside: string | null;
}

/** Every file in the bundled library, as paths relative to its root. */
function filesUnder(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, base));
    else out.push(relative(base, path));
  }
  return out;
}

export function installPersonas(
  bundledDir: string,
  targetDir: string,
  options: { force?: boolean; timestamp?: string } = {},
): PersonaInstallResult {
  if (!existsSync(bundledDir)) {
    throw new Error(`No bundled persona library at ${bundledDir}.`);
  }

  let movedAside: string | null = null;
  if (options.force === true && existsSync(targetDir)) {
    const stamp = options.timestamp ?? new Date().toISOString().replace(/[:.]/g, "-");
    movedAside = `${targetDir}.bak-${stamp}`;
    renameSync(targetDir, movedAside);
  }

  let written = 0;
  let skipped = 0;
  for (const file of filesUnder(bundledDir)) {
    const target = join(targetDir, file);
    if (existsSync(target)) {
      skipped += 1;
      continue;
    }
    mkdirSync(join(target, ".."), { recursive: true });
    cpSync(join(bundledDir, file), target);
    written += 1;
  }

  return { targetDir, written, skipped, movedAside };
}

/** How many files the library holds, for a plan that wants to say so before writing. */
export function personaCount(bundledDir: string): number {
  return existsSync(bundledDir) ? filesUnder(bundledDir).length : 0;
}
