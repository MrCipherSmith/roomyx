import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPersonas, personaCount } from "../../src/installer/personas";

const BUNDLED = join(import.meta.dir, "..", "..", "src", "bundled-personas");

let dir: string;
function tempDir(): string {
  dir = mkdtempSync(join(tmpdir(), "roomyx-personas-"));
  return dir;
}
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("the bundled persona library", () => {
  test("ships with the package, and holds what the skill promises", () => {
    // The skill now names these by shape: fifty numbered interview personas,
    // founder/tech/panel role sets, and a fifty-question interview script. If
    // the library stops matching, the skill starts lying to an agent that
    // cannot check.
    expect(existsSync(BUNDLED)).toBe(true);
    const top = readdirSync(BUNDLED);
    const numbered = top.filter((name) => /^\d\d-.+\.md$/.test(name));
    expect(numbered).toHaveLength(50);
    for (const set of ["founders", "tech", "panel"]) expect(top).toContain(set);
    expect(top).toContain("questionnaire-50.md");
    expect(personaCount(BUNDLED)).toBeGreaterThan(80);
  });

  test("the questionnaire really has fifty questions", () => {
    const text = readFileSync(join(BUNDLED, "questionnaire-50.md"), "utf8");
    const numbered = text.split("\n").filter((line) => /^\d+\. /.test(line));
    expect(numbered).toHaveLength(50);
  });

  test("carries no contact details, keys or tokens — it is published to a public registry", () => {
    // A one-way door: what goes to npm cannot be taken back. Asserted rather
    // than remembered.
    const suspicious = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}/;
    for (const file of readdirSync(BUNDLED, { recursive: true, encoding: "utf8" })) {
      const path = join(BUNDLED, file);
      if (!file.endsWith(".md")) continue;
      expect(readFileSync(path, "utf8")).not.toMatch(suspicious);
    }
  });
});

describe("installing it", () => {
  test("copies the whole tree, subdirectories included", () => {
    const root = tempDir();
    const target = join(root, ".roomyx", "personas");

    const result = installPersonas(BUNDLED, target);
    expect(result.written).toBe(personaCount(BUNDLED));
    expect(result.skipped).toBe(0);
    expect(existsSync(join(target, "questionnaire-50.md"))).toBe(true);
    expect(existsSync(join(target, "founders"))).toBe(true);
    expect(readdirSync(join(target, "founders")).length).toBeGreaterThan(0);
  });

  test("never overwrites a persona someone has edited", () => {
    // These are shipped as markdown precisely so they can be edited. An install
    // that silently reverted an edit would be the theft D-02 exists to prevent.
    const root = tempDir();
    const target = join(root, "personas");
    mkdirSync(target, { recursive: true });
    const mine = join(target, "01-ngozi-tailor-nigeria.md");
    writeFileSync(mine, "MY OWN VERSION");

    const result = installPersonas(BUNDLED, target);
    expect(readFileSync(mine, "utf8")).toBe("MY OWN VERSION");
    expect(result.skipped).toBe(1);
    expect(result.written).toBe(personaCount(BUNDLED) - 1);
  });

  test("a second install changes nothing", () => {
    const root = tempDir();
    const target = join(root, "personas");
    installPersonas(BUNDLED, target);

    const second = installPersonas(BUNDLED, target);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(personaCount(BUNDLED));
    expect(second.movedAside).toBeNull();
  });

  test("--force moves the old library aside rather than merging into it", () => {
    // One rename is cheap and reversible; eighty-seven individual backups are
    // noise. The old directory is still there to read.
    const root = tempDir();
    const target = join(root, "personas");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "01-ngozi-tailor-nigeria.md"), "MY OWN VERSION");

    const result = installPersonas(BUNDLED, target, { force: true, timestamp: "STAMP" });
    expect(result.movedAside).toBe(`${target}.bak-STAMP`);
    expect(readFileSync(join(`${target}.bak-STAMP`, "01-ngozi-tailor-nigeria.md"), "utf8")).toBe("MY OWN VERSION");
    expect(readFileSync(join(target, "01-ngozi-tailor-nigeria.md"), "utf8")).not.toBe("MY OWN VERSION");
    expect(result.written).toBe(personaCount(BUNDLED));
  });

  test("a missing library is a sentence naming the directory", () => {
    const root = tempDir();
    expect(() => installPersonas(join(root, "nope"), join(root, "out"))).toThrow(join(root, "nope"));
  });
});
