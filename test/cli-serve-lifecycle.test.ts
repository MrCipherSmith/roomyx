import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { realpathSync } from "node:fs";

const FIXTURE = join(import.meta.dir, "fixtures", "sample-room.jsonl");
const CLI = join(import.meta.dir, "..", "src", "cli.ts");

let dir: string;
let proc: ReturnType<typeof Bun.spawn> | undefined;

afterEach(async () => {
  if (proc && proc.exitCode === null) {
    proc.kill();
    await proc.exited.catch(() => undefined);
  }
  proc = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function waitForRegistration(
  registryPath: string,
  deadlineMs: number,
): Promise<{ pid: number; logPath: string } | undefined> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as {
      rooms?: { pid: number; logPath: string }[];
    };
      if (parsed.rooms && parsed.rooms.length > 0) {
        return parsed.rooms[0];
      }
    } catch {
      // Not written yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
}

describe("cli serve lifecycle (AC2: real running instance, not just registry.ts unit behavior)", () => {
  test("registers itself on start and deregisters its own entry on clean shutdown (SIGTERM)", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-cli-test-"));
    const registryPath = join(dir, "registry.json");

    proc = Bun.spawn(["bun", CLI, "serve", FIXTURE, "--port", "0", "--registry", registryPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const registered = await waitForRegistration(registryPath, 5000);
    expect(registered).toBeDefined();
    expect(registered?.pid).toBe(proc.pid);

    proc.kill("SIGTERM");
    await proc.exited;

    const after = JSON.parse(readFileSync(registryPath, "utf8")) as { rooms: unknown[] };
    expect(after.rooms).toHaveLength(0);
  }, 10000);

  test("a room that shuts down is recorded in history, and `rooms history` shows it", async () => {
    // End to end rather than against `archiveRoom` directly: the unit tests
    // prove the index is correct, and this proves the shutdown path actually
    // reaches it. Those are different claims, and it was the second one that
    // was missing when the registry's own deregistration was first written.
    dir = mkdtempSync(join(tmpdir(), "roomyx-cli-history-"));
    const registryPath = join(dir, "registry.json");
    const historyPath = join(dir, "history.jsonl");

    proc = Bun.spawn(["bun", CLI, "serve", FIXTURE, "--port", "0", "--registry", registryPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await waitForRegistration(registryPath, 5000)).toBeDefined();

    proc.kill("SIGTERM");
    await proc.exited;

    const recorded = JSON.parse(readFileSync(historyPath, "utf8").trim()) as Record<string, unknown>;
    expect(recorded.logPath).toBe(FIXTURE);
    expect(recorded.messages).toBe(4);
    expect(recorded.participants).toBe(3);
    expect(recorded.goal).toBe("Decide whether the roomyx MCP server MVP is ready to review.");

    const listed = Bun.spawnSync(["bun", CLI, "rooms", "history", "--registry", registryPath]);
    const out = listed.stdout.toString();
    expect(out).toContain("messages=4");
    expect(out).toContain(FIXTURE);
    // The log is still where the room left it, so nothing should claim otherwise.
    expect(out).not.toContain("no longer at this path");
  }, 15000);

  test("history survives the log being moved away, and says the log is gone", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-cli-history-moved-"));
    const registryPath = join(dir, "registry.json");
    const logPath = join(dir, "room.jsonl");
    copyFileSync(FIXTURE, logPath);

    proc = Bun.spawn(["bun", CLI, "serve", logPath, "--port", "0", "--registry", registryPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await waitForRegistration(registryPath, 5000)).toBeDefined();
    proc.kill("SIGTERM");
    await proc.exited;

    rmSync(logPath);

    const listed = Bun.spawnSync(["bun", CLI, "rooms", "history", "--registry", registryPath]);
    const out = listed.stdout.toString();
    // The room is still remembered — that is what an index buys over a copy
    // that would simply be missing too if the whole directory went.
    expect(out).toContain("messages=4");
    expect(out).toContain("no longer at this path");
  }, 15000);

  test("appending into a served log says so, on stderr, without refusing", async () => {
    // The D-18 writer guard cannot engage for the agent workflow: a dispatcher
    // runs `roomyx serve` and writes with `roomyx room append`, a fresh process
    // each time, so it never holds a lease and the room never reports a
    // dispatcher. `serving` was computed for the refusal and then silently
    // dropped — so every append into a room an agent is running looked, from
    // the CLI, like an append into an unattended log.
    //
    // A note rather than a refusal, because nothing here can tell a dispatcher
    // from a stranger and refusing would block the legitimate writer. The log
    // is safe either way: `seq` allocation is under a lock, and that is tested
    // separately. What the note protects is the conversation.
    dir = mkdtempSync(join(tmpdir(), "roomyx-cli-served-note-"));
    const registryPath = join(dir, "registry.json");
    const logPath = join(dir, "room.jsonl");
    copyFileSync(FIXTURE, logPath);

    const quiet = Bun.spawnSync(["bun", CLI, "room", "append", logPath, "--from", "yuki", "--body", "before"]);
    expect(quiet.exitCode).toBe(0);
    // Nothing is serving it yet, so there is nothing to warn about.
    expect(quiet.stderr.toString()).not.toContain("is serving");

    proc = Bun.spawn(["bun", CLI, "serve", logPath, "--port", "0", "--registry", registryPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const registered = await waitForRegistration(registryPath, 5000);
    expect(registered).toBeDefined();

    const noisy = Bun.spawnSync([
      "bun", CLI, "room", "append", logPath,
      "--from", "yuki", "--body", "during", "--registry", registryPath,
    ]);

    // Allowed, and it actually wrote.
    expect(noisy.exitCode).toBe(0);
    expect(noisy.stdout.toString()).toContain("Appended seq");

    // The note is on stderr, because stdout carries "Appended seq N from X" and
    // is parsed. A warning printed there would corrupt that.
    expect(noisy.stderr.toString()).toContain("is serving");
    expect(noisy.stdout.toString()).not.toContain("is serving");
  }, 20000);

  test("records an absolute logPath even when given a relative one — the registry outlives this cwd", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-cli-abs-"));
    const registryPath = join(dir, "registry.json");
    copyFileSync(FIXTURE, join(dir, "room.jsonl"));

    // Relative on the command line, run from the directory that holds it.
    proc = Bun.spawn(["bun", CLI, "serve", "./room.jsonl", "--port", "0", "--registry", registryPath], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const registered = await waitForRegistration(registryPath, 5000);
    // Resolved, because the registry stores what the process resolved. On macOS
    // `mkdtempSync(tmpdir())` hands back `/var/folders/...`, which is a symlink
    // to `/private/var/folders/...`: comparing against the unresolved spelling
    // failed on this platform while the recorded path was correct, and it is the
    // one assertion in this suite that could not pass here.
    expect(registered?.logPath).toBe(join(realpathSync(dir), "room.jsonl"));
    expect(isAbsolute(registered?.logPath ?? "")).toBe(true);
  }, 10000);
});
