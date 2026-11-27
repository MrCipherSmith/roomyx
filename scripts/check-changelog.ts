#!/usr/bin/env bun
import { readFileSync } from "node:fs";

/** True when the changelog has a `## [version]` heading for exactly this version. */
export function hasChangelogEntry(changelog: string, version: string): boolean {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^## \\[${escaped}\\]`, "m").test(changelog);
}

if (import.meta.main) {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;
  if (!hasChangelogEntry(readFileSync("CHANGELOG.md", "utf8"), version)) {
    console.error(`CHANGELOG.md has no "## [${version}]" entry for the version in package.json.`);
    process.exit(1);
  }
  console.log(`CHANGELOG.md has an entry for ${version}.`);
}
