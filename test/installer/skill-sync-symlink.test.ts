import { afterEach, describe, expect, test } from "bun:test";
import { lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncSkill } from "../../src/installer/skill-sync";

const BUNDLED = join(import.meta.dir, "..", "fixtures", "bundled-skill.md");

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "roomyx-sync-symlink-"));
  dirs.push(dir);
  return dir;
}

function freshConfig(dir: string): string {
  const configPath = join(dir, "config.json");
  writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, defaultPort: 4319, roomLogDir: "" }));
  return configPath;
}

/** Runs the sync and reports how it declined, so either shape of refusal counts. */
function sync(options: Parameters<typeof syncSkill>[0]): { threw: string | null; written: boolean; said: string } {
  try {
    const result = syncSkill(options);
    return { threw: null, written: result.written, said: result.warnings.join(" ") };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error), written: false, said: String(error) };
  }
}

/**
 * The backup is the attack surface, not the file being synced (AC9).
 *
 * `syncSkill` does `copyFileSync(target, "${target}.bak")` and then
 * `writeFileSync(target, bundled)` with no `lstat` and no path-type check on
 * either path. Both calls follow a symlink, so anything that can create a file
 * beside the skill target — a shared `~/.claude/skills` directory, a
 * world-writable project checkout, an earlier-running install script — picks
 * where roomyx's next `--yes` writes.
 *
 * The audit reproduced this with one `syncSkill({yes: true})`: plant a symlink
 * at the `.bak` path pointing at a file that has nothing to do with skills, and
 * the target's current bytes land in that file. The victim is chosen by whoever
 * planted the link and its content is chosen by whoever last edited the skill
 * file — an arbitrary-file overwrite reachable from an operation whose whole
 * promise is "backed up before overwriting".
 */
describe("a symlink on the sync's write paths", () => {
  test("a symlink planted at the .bak path does not become a write into its victim", () => {
    const dir = tempDir();
    const configPath = freshConfig(dir);
    const target = join(dir, "SKILL.md");
    const victim = join(dir, "victim.txt");

    writeFileSync(victim, "VICTIM ORIGINAL CONTENT — nothing to do with skills\n");
    // What the attacker gets to choose: the bytes that the backup step will copy.
    writeFileSync(target, "ATTACKER-CHOSEN PAYLOAD\n");
    symlinkSync(victim, `${target}.bak`);

    const outcome = sync({ bundledSkillPath: BUNDLED, targetPath: target, configPath, yes: true });

    // The load-bearing assertion: the victim was not written through the link.
    expect(readFileSync(victim, "utf8")).toBe("VICTIM ORIGINAL CONTENT — nothing to do with skills\n");
    // And the link itself is still a link, so nothing "backed up" over it either.
    expect(lstatSync(`${target}.bak`).isSymbolicLink()).toBe(true);
    // Refused by name, per AC9 — a refusal that does not say which path is a
    // symlink leaves the operator hunting for it.
    expect(outcome.written).toBe(false);
    expect(`${outcome.threw ?? ""} ${outcome.said}`).toContain(".bak");
  });

  test("a symlinked target is not written through either", () => {
    // The same missing check on the other call. AC9 names the target as well as
    // its `.bak` path, and `writeFileSync` follows a link exactly as
    // `copyFileSync` does — here the content is the bundled skill, so the
    // attacker chooses the victim and roomyx supplies the bytes.
    const dir = tempDir();
    const configPath = freshConfig(dir);
    const target = join(dir, "SKILL.md");
    const victim = join(dir, "victim.txt");

    writeFileSync(victim, "VICTIM ORIGINAL CONTENT\n");
    symlinkSync(victim, target);

    const outcome = sync({ bundledSkillPath: BUNDLED, targetPath: target, configPath, yes: true });

    expect(readFileSync(victim, "utf8")).toBe("VICTIM ORIGINAL CONTENT\n");
    expect(outcome.written).toBe(false);
    expect(`${outcome.threw ?? ""} ${outcome.said}`).toContain("SKILL.md");
  });
});
