import { describe, expect, test } from "bun:test";
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
});
