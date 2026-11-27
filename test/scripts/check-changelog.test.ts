import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasChangelogEntry } from "../../scripts/check-changelog";

const LOG = "# Changelog\n\n## [Unreleased]\n\n## [0.12.2] — 2026-09-12\n\n## [0.12.20] — 2026-10-01\n";

describe("hasChangelogEntry", () => {
  test("finds the heading for a released version", () => {
    expect(hasChangelogEntry(LOG, "0.12.2")).toBe(true);
  });

  test("a version with no heading is missing, and a longer version does not stand in for a shorter one", () => {
    expect(hasChangelogEntry(LOG, "0.12.3")).toBe(false);
    expect(hasChangelogEntry("## [0.12.20] — x\n", "0.12.2")).toBe(false);
  });

  test("the dots in a version are literal, not wildcards", () => {
    expect(hasChangelogEntry("## [0x12y2] — x\n", "0.12.2")).toBe(false);
  });

  test("a mention in prose is not an entry", () => {
    expect(hasChangelogEntry("see ## [0.12.2] in the notes", "0.12.2")).toBe(false);
  });

  test("prerelease and build-metadata versions match literally", () => {
    expect(hasChangelogEntry("## [1.0.0-rc.1] — x\n", "1.0.0-rc.1")).toBe(true);
    expect(hasChangelogEntry("## [1.0.0+build.5] — x\n", "1.0.0+build.5")).toBe(true);
    expect(hasChangelogEntry("## [1.0.0-rc.1] — x\n", "1.0.0")).toBe(false);
  });

  test("a changelog with Windows line endings is still read", () => {
    expect(hasChangelogEntry("# Changelog\r\n\r\n## [0.12.2] — x\r\n", "0.12.2")).toBe(true);
  });
});

describe("check-changelog as a command", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function run(version: string, changelog: string) {
    dir = mkdtempSync(join(tmpdir(), "roomyx-changelog-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
    writeFileSync(join(dir, "CHANGELOG.md"), changelog);
    return Bun.spawnSync(["bun", join(import.meta.dir, "..", "..", "scripts", "check-changelog.ts")], { cwd: dir });
  }

  test("exits 0 when the version has an entry", () => {
    expect(run("0.12.2", LOG).exitCode).toBe(0);
  });

  test("exits 1 and names the missing heading when it does not", () => {
    const result = run("0.12.3", LOG);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('## [0.12.3]');
  });
});
