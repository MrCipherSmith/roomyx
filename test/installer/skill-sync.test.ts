import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncSkill } from "../../src/installer/skill-sync";

let dir: string;
const BUNDLED = join(import.meta.dir, "..", "fixtures", "bundled-skill.md");

function freshConfig(dir: string): string {
  const configPath = join(dir, "config.json");
  writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, defaultPort: 4319, roomLogDir: "" }));
  return configPath;
}

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("syncSkill", () => {
  test("first sync to a nonexistent target: writes it, no backup needed, records the hash", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-sync-test-"));
    const configPath = freshConfig(dir);
    const target = join(dir, "SKILL.md");

    const result = syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath, yes: true });
    expect(result.written).toBe(true);
    expect(result.backedUpTo).toBeNull();
    expect(readFileSync(target, "utf8")).toBe(readFileSync(BUNDLED, "utf8"));
  });

  test("re-sync when the target matches the last-synced hash: overwrites cleanly, no warning (AC4)", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-sync-test-"));
    const configPath = freshConfig(dir);
    const target = join(dir, "SKILL.md");
    syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath, yes: true });

    const result = syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath, yes: true });
    expect(result.written).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("target has independent hand-edits since last sync: refuses to write without --yes, warns (AC4)", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-sync-test-"));
    const configPath = freshConfig(dir);
    const target = join(dir, "SKILL.md");
    syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath, yes: true });
    writeFileSync(target, "hand-edited content, not what we last synced");

    const result = syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath });
    expect(result.written).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(readFileSync(target, "utf8")).toBe("hand-edited content, not what we last synced");
  });

  test("target has independent hand-edits, but --yes forces the write with a backup (AC4)", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-sync-test-"));
    const configPath = freshConfig(dir);
    const target = join(dir, "SKILL.md");
    syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath, yes: true });
    writeFileSync(target, "hand-edited content, not what we last synced");

    const result = syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath, yes: true });
    expect(result.written).toBe(true);
    expect(result.backedUpTo).not.toBeNull();
    expect(readFileSync(result.backedUpTo as string, "utf8")).toBe("hand-edited content, not what we last synced");
    expect(readFileSync(target, "utf8")).toBe(readFileSync(BUNDLED, "utf8"));
    // Backup file actually exists alongside the target, timestamped.
    const files = readdirSync(dir);
    expect(files.some((f) => f.startsWith("SKILL.md.bak-"))).toBe(true);
  });

  test("first-ever sync to a target with pre-existing, never-bundled content: refuses without --yes (regression)", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-sync-test-"));
    const configPath = freshConfig(dir);
    const target = join(dir, "SKILL.md");
    // Pre-existing content roomyx has never touched — no config.json entry
    // for this target at all, unlike the "hand-edited since last sync" test
    // above where a prior sync DID happen.
    writeFileSync(target, "SOMEONE ELSE'S PRE-EXISTING UNRELATED FILE CONTENT, never bundled by us");

    const result = syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath });
    expect(result.written).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(readFileSync(target, "utf8")).toBe(
      "SOMEONE ELSE'S PRE-EXISTING UNRELATED FILE CONTENT, never bundled by us",
    );
  });

  test("first-ever sync with pre-existing content, but --yes forces it with a backup", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-sync-test-"));
    const configPath = freshConfig(dir);
    const target = join(dir, "SKILL.md");
    writeFileSync(target, "pre-existing, never bundled");

    const result = syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath, yes: true });
    expect(result.written).toBe(true);
    expect(result.backedUpTo).not.toBeNull();
    expect(readFileSync(result.backedUpTo as string, "utf8")).toBe("pre-existing, never bundled");
  });

  test("dryRun never writes or backs up, only reports what would happen", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-sync-test-"));
    const configPath = freshConfig(dir);
    const target = join(dir, "SKILL.md");
    writeFileSync(target, "pre-existing content");

    const result = syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath, dryRun: true });
    expect(result.written).toBe(false);
    expect(result.wouldWrite).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("pre-existing content");
    expect(existsSync(join(dir, "SKILL.md.bak"))).toBe(false);
  });
});

describe("the write gate is off by default", () => {
  test("a call that does not ask for a write does not get one", () => {
    // The default used to be computed by each caller. The CLI computed
    // `dryRun = --dry-run || !yes`; the MCP tool passed both through as
    // undefined and so wrote a real skill file with no confirmation, over an
    // unauthenticated loopback port, while the CLI's own help said "Without
    // --yes nothing is written". One default, here, and it fails closed.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-sync-default-"));
    try {
      const configPath = freshConfig(dir);
      const target = join(dir, "SKILL.md");
      const result = syncSkill({ bundledSkillPath: BUNDLED, targetPath: target, configPath });
      expect(result.written).toBe(false);
      expect(result.wouldWrite).toBe(true);
      expect(existsSync(target)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
