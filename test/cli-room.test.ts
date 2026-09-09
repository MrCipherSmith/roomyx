import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

let dir: string | undefined;
const procs: ReturnType<typeof Bun.spawn>[] = [];

afterEach(async () => {
  for (const proc of procs) {
    if (proc.exitCode === null) {
      proc.kill("SIGTERM");
      await proc.exited.catch(() => undefined);
    }
  }
  procs.length = 0;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function run(args: string[], cwd?: string) {
  const proc = Bun.spawn(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe", ...(cwd ? { cwd } : {}) });
  procs.push(proc);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr, code: proc.exitCode };
}

describe("roomyx room new", () => {
  test("creates a log whose first line is the state record, with the goal and roster", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-new-"));
    const log = join(dir, "room.jsonl");

    const { code } = await run(["room", "new", log, "--goal", "Pick a database", "--roster", "yuki:Юки,omar:Omar"]);
    expect(code).toBe(0);

    const first = JSON.parse(readFileSync(log, "utf8").split("\n")[0] as string);
    expect(first.type).toBe("state");
    expect(first.goal_contract.goal_statement).toBe("Pick a database");
    expect(first.roster).toEqual([
      { id: "yuki", name: "Юки" },
      { id: "omar", name: "Omar" },
    ]);
  });

  test("refuses to overwrite an existing log — a room log is append-only", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-new-"));
    const log = join(dir, "room.jsonl");
    await run(["room", "new", log, "--goal", "First"]);

    const { stderr, code } = await run(["room", "new", log, "--goal", "Second"]);
    expect(code).toBe(1);
    expect(stderr).toContain("already exists");
    // The original survived.
    expect(readFileSync(log, "utf8")).toContain("First");
  });

  test("a room without a goal is refused rather than defaulted", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-new-"));
    const { stderr, code } = await run(["room", "new", join(dir, "r.jsonl")]);
    expect(code).toBe(1);
    expect(stderr).toContain("--goal");
    expect(existsSync(join(dir, "r.jsonl"))).toBe(false);
  });
});

describe("roomyx room append", () => {
  test("numbers messages from the log rather than from a counter it keeps", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-append-"));
    const log = join(dir, "room.jsonl");
    await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);

    await run(["room", "append", log, "--from", "a", "--body", "first"]);
    await run(["room", "append", log, "--from", "a", "--body", "second", "--kind", "challenge", "--in-reply-to", "1"]);

    const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
    const messages = lines.slice(1).map((l) => JSON.parse(l));
    expect(messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(messages[1].kind).toBe("challenge");
    expect(messages[1].in_reply_to).toBe(1);
  });

  test("refuses a log that does not exist, and says how to make one", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-append-"));
    const { stderr, code } = await run([
      "room",
      "append",
      join(dir, "nope.jsonl"),
      "--from",
      "a",
      "--body",
      "x",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("roomyx room new");
  });

  // D-01a. This is the guard the amendment exists for: appending to a log a
  // dispatcher is actively writing would mint a second writer into a live room.
  test("refuses when a live room is serving that log, and names the room", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-guard-"));
    const log = join(dir, "room.jsonl");
    const registryPath = join(dir, "registry.json");
    await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);

    const server = Bun.spawn(["bun", CLI, "serve", log, "--port", "0", "--registry", registryPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    procs.push(server);

    // Wait for it to register itself.
    const deadline = Date.now() + 5000;
    let roomId = "";
    while (Date.now() < deadline && !roomId) {
      try {
        const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as { rooms: { id: string }[] };
        if (parsed.rooms.length > 0) roomId = parsed.rooms[0]!.id;
      } catch {
        // not written yet
      }
      if (!roomId) await new Promise((r) => setTimeout(r, 50));
    }
    expect(roomId).not.toBe("");

    const before = readFileSync(log, "utf8");
    const refused = await run(["room", "append", log, "--from", "a", "--body", "x", "--registry", registryPath]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(roomId);
    expect(refused.stderr).toContain("D-01");
    expect(readFileSync(log, "utf8")).toBe(before);

    // --force is the deliberate override, and it writes.
    const forced = await run([
      "room",
      "append",
      log,
      "--from",
      "a",
      "--body",
      "x",
      "--registry",
      registryPath,
      "--force",
    ]);
    expect(forced.code).toBe(0);
    expect(readFileSync(log, "utf8")).not.toBe(before);
  }, 15000);
});
