import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerRoom } from "../src/installer/registry";
import { serve } from "../src/server/serve";
import type { ServeHandle } from "../src/server/serve";
import { LEASE_STALE_MS, acquireWriterLease, writerLeasePathFor } from "../src/writer-lease";

const FIXTURE = join(import.meta.dir, "fixtures", "sample-room.jsonl");
const CLI = join(import.meta.dir, "..", "src", "cli.ts");

let dir: string | undefined;
let handle: ServeHandle | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function run(args: string[]) {
  const proc = Bun.spawn(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  await proc.exited;
  return { stdout, stderr, code: proc.exitCode };
}

/**
 * The dangerous row of the ownership table, across real processes.
 *
 * The other CLI cases simulate a live writer by writing a lease file, which
 * proves the CLI reads one. This one produces the state for real: a server with
 * a dispatcher attached, holding its own lease, registered in a registry, while
 * `roomyx room append` runs as a separate process against it. If the two halves
 * disagreed about the shared file, this is where it would show.
 */
describe("a room with a live dispatcher, across processes", () => {
  test("append refuses and names the writer, and --take-over does not override a live one", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-owner-e2e-"));
    const log = join(dir, "room.jsonl");
    copyFileSync(FIXTURE, log);
    const registryPath = join(dir, "registry.json");

    handle = await serve(log, {
      port: 0,
      onOwnerCommand: () => ({ accepted: true }),
      writerLeasePath: writerLeasePathFor(registryPath),
    });
    const entry = registerRoom(registryPath, { port: handle.port, logPath: log, pid: process.pid });

    const before = readFileSync(log, "utf8");
    const refused = await run(["room", "append", log, "--from", "yuki", "--body", "typed by hand", "--registry", registryPath]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(entry.id);
    // Named, and named as a pid: "a writer is live" is only actionable if you
    // can find it.
    expect(refused.stderr).toContain(String(process.pid));

    const taken = await run([
      "room", "append", log, "--from", "yuki", "--body", "typed by hand", "--registry", registryPath, "--take-over",
    ]);
    expect(taken.code).toBe(1);
    // The lease is still being refreshed while this runs, so nothing may write.
    expect(readFileSync(log, "utf8")).toBe(before);
  }, 25000);

  test("a writer that died while its server kept serving: --take-over writes, and the log says so", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-owner-e2e-stale-"));
    const log = join(dir, "room.jsonl");
    copyFileSync(FIXTURE, log);
    const registryPath = join(dir, "registry.json");
    const leasePath = writerLeasePathFor(registryPath);

    handle = await serve(log, {
      port: 0,
      onOwnerCommand: () => ({ accepted: true }),
      writerLeasePath: leasePath,
    });
    const entry = registerRoom(registryPath, { port: handle.port, logPath: log, pid: process.pid });

    // The server keeps answering; the lease stops being renewed and goes stale.
    // This is the state the row exists for, and it cannot be produced by
    // stopping the server — a stopped server is a different case (no live room
    // at all, which needs no flag).
    acquireWriterLease(leasePath, { pid: 999_999, now: Date.now() - LEASE_STALE_MS * 3 });

    // A stale lease still means a writer was there: taking over is deliberate.
    const refused = await run(["room", "append", log, "--from", "yuki", "--body", "x", "--registry", registryPath]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(entry.id);

    const taken = await run([
      "room", "append", log, "--from", "yuki", "--body", "after the writer died", "--registry", registryPath, "--take-over",
    ]);
    expect(taken.stderr).toBe("");
    expect(taken.code).toBe(0);

    const recorded = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(recorded.some((m) => m.body === "after the writer died")).toBe(true);
    // Found by what it says, not by its kind: the fixture room has a `status`
    // message of its own, and a `find` on the kind would happily pick that one
    // and assert nothing about this write.
    const trace = recorded.find((m) => typeof m.body === "string" && m.body.includes("--take-over"));
    expect(trace).toBeDefined();
    expect(trace?.kind).toBe("status");
    // The room id, so a later reader can tell which room was taken over.
    expect(String(trace?.body)).toContain(entry.id);
  }, 25000);
});
