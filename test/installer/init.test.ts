import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/installer/init";

let dir: string;
const BUNDLED_SKILL = join(import.meta.dir, "..", "fixtures", "bundled-skill.md");

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("init", () => {
  test("creates .roomyx/config.json and .roomyx/rooms/registry.json with valid default content (AC1)", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-init-test-"));
    const result = init({ cwd: dir, bundledSkillPath: BUNDLED_SKILL });
    expect(result.created).toBe(true);

    const config = JSON.parse(readFileSync(join(dir, ".roomyx", "config.json"), "utf8"));
    expect(config.schemaVersion).toBe(1);
    expect(config.defaultPort).toBe(4319);

    const registry = JSON.parse(readFileSync(join(dir, ".roomyx", "rooms", "registry.json"), "utf8"));
    expect(registry).toEqual({ schemaVersion: 1, rooms: [] });
  });

  test("stages a copy of the bundled skill", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-init-test-"));
    init({ cwd: dir, bundledSkillPath: BUNDLED_SKILL });
    const staged = readFileSync(join(dir, ".roomyx", "skills", "startup-room", "SKILL.md"), "utf8");
    expect(staged).toBe(readFileSync(BUNDLED_SKILL, "utf8"));
  });

  test("does not silently overwrite an existing non-empty registry (AC1)", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-init-test-"));
    init({ cwd: dir, bundledSkillPath: BUNDLED_SKILL });
    const registryPath = join(dir, ".roomyx", "rooms", "registry.json");
    writeFileSync(registryPath, JSON.stringify({ schemaVersion: 1, rooms: [{ id: "r-existing" }] }));

    const result = init({ cwd: dir, bundledSkillPath: BUNDLED_SKILL });
    expect(result.created).toBe(false);
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    expect(registry.rooms).toEqual([{ id: "r-existing" }]);
  });

  test("running init twice on an empty .roomyx is idempotent, not an error", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-init-test-"));
    init({ cwd: dir, bundledSkillPath: BUNDLED_SKILL });
    expect(() => init({ cwd: dir, bundledSkillPath: BUNDLED_SKILL })).not.toThrow();
    expect(existsSync(join(dir, ".roomyx", "config.json"))).toBe(true);
  });
});
