import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("re-running init", () => {
  test("does not clobber a hand-edited staged skill", () => {
    // The two writes beside it were guarded and this one was not, while the
    // function's own comment promised "explicit, never-clobbering" — so a
    // second `roomyx init` silently discarded edits to the staged copy, which
    // is the operation `syncSkill` refuses outright.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-init-reinit-"));
    try {
      init({ cwd: dir, bundledSkillPath: BUNDLED_SKILL });
      const staged = join(dir, ".roomyx", "skills", "startup-room", "SKILL.md");
      writeFileSync(staged, "hand-edited staged copy");

      init({ cwd: dir, bundledSkillPath: BUNDLED_SKILL });
      expect(readFileSync(staged, "utf8")).toBe("hand-edited staged copy");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the staged skill is synced, not copied once", () => {
  /**
   * `init` wrote the staged copy with `copyFileSync` when it was absent and did
   * nothing when it was present — so after a package upgrade
   * `.roomyx/skills/startup-room/SKILL.md` kept the old text forever, with no
   * hash, no backup and no warning. That is the operation `syncSkill` exists to
   * refuse, and the backlog's S3 asks for exactly this routing.
   */
  function initWith(dir: string, bundled: string) {
    return init({ cwd: dir, bundledSkillPath: bundled });
  }

  test("re-running init after the bundled skill changed refreshes the staged copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomyx-init-sync-"));
    const second = join(dir, "bundled-v2.md");
    try {
      writeFileSync(second, "# Startup Room v2\n");
      initWith(dir, second);
      const staged = join(dir, ".roomyx", "skills", "startup-room", "SKILL.md");
      expect(readFileSync(staged, "utf8")).toBe("# Startup Room v2\n");

      // A new package version ships a new bundled skill.
      const third = join(dir, "bundled-v3.md");
      writeFileSync(third, "# Startup Room v3\n");
      const result = initWith(dir, third);

      // The staged copy is ours — we recorded its hash — so refreshing it is
      // safe and is the whole point.
      expect(readFileSync(staged, "utf8")).toBe("# Startup Room v3\n");
      expect(result.skillWarnings ?? []).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a hand-edited staged copy is left alone, and init says so", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomyx-init-sync-edit-"));
    try {
      initWith(dir, BUNDLED_SKILL);
      const staged = join(dir, ".roomyx", "skills", "startup-room", "SKILL.md");
      writeFileSync(staged, "hand-edited staged copy");

      const result = initWith(dir, BUNDLED_SKILL);

      expect(readFileSync(staged, "utf8")).toBe("hand-edited staged copy");
      // Silence was the defect: the copy stayed stale and nothing said why.
      expect((result.skillWarnings ?? []).join(" ")).toContain("hand-edited");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a re-init that changes nothing writes nothing and leaves no backup", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomyx-init-sync-noop-"));
    try {
      initWith(dir, BUNDLED_SKILL);
      initWith(dir, BUNDLED_SKILL);
      initWith(dir, BUNDLED_SKILL);

      const stagingDir = join(dir, ".roomyx", "skills", "startup-room");
      // Backing up an identical file once per run would fill the directory with
      // timestamped copies of the same content — noise that makes a real backup
      // impossible to find.
      expect(readdirSync(stagingDir)).toEqual(["SKILL.md"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("a staged copy that is already the bundled skill is adopted", () => {
  test("a moved project can refresh again, because the hash gets recorded", () => {
    // The sync records its hashes by absolute path, so moving a project leaves
    // the staging directory with no recorded hash for its new location — and the
    // unrecorded-content refusal then keeps the copy stale forever. When the
    // content is byte-identical to the bundled skill there is nothing the
    // refusal protects: a write cannot lose anything, and it records the hash
    // that makes the next real upgrade refresh. Found by reviewing this
    // change's own work, not by the suite.
    const source = mkdtempSync(join(tmpdir(), "roomyx-init-adopt-a-"));
    const moved = mkdtempSync(join(tmpdir(), "roomyx-init-adopt-b-"));
    try {
      init({ cwd: source, bundledSkillPath: BUNDLED_SKILL });
      cpSync(join(source, ".roomyx"), join(moved, ".roomyx"), { recursive: true });

      const afterMove = init({ cwd: moved, bundledSkillPath: BUNDLED_SKILL });
      expect(afterMove.skillWarnings ?? []).toEqual([]);

      // And now a real upgrade lands: the proof the hash was recorded.
      const upgraded = join(source, "bundled-v2.md");
      writeFileSync(upgraded, "# Startup Room v2\n");
      init({ cwd: moved, bundledSkillPath: upgraded });
      expect(readFileSync(join(moved, ".roomyx", "skills", "startup-room", "SKILL.md"), "utf8")).toBe(
        "# Startup Room v2\n",
      );
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(moved, { recursive: true, force: true });
    }
  });
});
