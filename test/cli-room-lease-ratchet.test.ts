import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWriterLease, writerLeasePathFor } from "../src/writer-lease";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function run(args: string[]) {
  const proc = Bun.spawn(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr, code: proc.exitCode };
}

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * The take-over ratchet, and why it is a ratchet.
 *
 * `room append --take-over` acquires the writer lease with its **own** pid
 * (`cli.ts`, the `acquireWriterLease` at the end of the append path) and then the
 * process exits. Nothing releases it — `releaseWriterLease` is called from
 * `src/server/serve.ts` and nowhere else — so what is left behind is a fresh
 * lease held by a pid that no longer exists, and `readWriterLease` calls that
 * `held: true` for the next `LEASE_STALE_MS`.
 *
 * The next plain `room append` therefore refuses: "A writer is live … pid N",
 * naming a dead process, for a room nobody is serving. One deliberate recovery
 * turns the log read-only for half a minute, and repeating the recovery extends
 * it — a take-over that has to be re-taken is not a recovery.
 *
 * This is the whole point of a lease over a lock (the module's own words): "a
 * holder that dies leaves a lease that expires rather than one that blocks
 * forever". A one-shot process is dead by the time anyone reads its lease, so it
 * must not hold one at all.
 */
describe("a one-shot --take-over does not leave the log locked behind it", () => {
  test("append → --take-over → append: the third call writes", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-lease-ratchet-"));
    const log = join(dir, "room.jsonl");
    const registryPath = join(dir, "registry.json");
    expect((await run(["room", "new", log, "--goal", "g", "--roster", "a:A"])).code).toBe(0);

    const first = await run(["room", "append", log, "--from", "a", "--body", "first", "--registry", registryPath]);
    expect(first.code).toBe(0);

    // Nothing holds a lease and no room is serving, so this take-over is the
    // no-op-but-deliberate case: it writes, and records that it did.
    const taken = await run([
      "room", "append", log, "--from", "a", "--body", "after a take-over", "--registry", registryPath, "--take-over",
    ]);
    expect(taken.code).toBe(0);

    // Whatever the take-over left behind, it is not a live writer: the only
    // process that could have been one has exited.
    const leasePath = writerLeasePathFor(registryPath, log);
    if (existsSync(leasePath)) {
      const state = readWriterLease(leasePath);
      expect(state.held && pidIsAlive(state.lease.pid)).toBe(false);
    }

    const third = await run(["room", "append", log, "--from", "a", "--body", "third", "--registry", registryPath]);
    expect(third.stderr).not.toContain("A writer is live");
    expect(third.code).toBe(0);

    const bodies = readFileSync(log, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(1)
      .map((line) => (JSON.parse(line) as { body: string }).body);
    expect(bodies).toContain("third");
  }, 30000);
});
