import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

async function waitForRegistration(registryPath: string, deadlineMs: number): Promise<{ pid: number } | undefined> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as { rooms?: { pid: number }[] };
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
});
