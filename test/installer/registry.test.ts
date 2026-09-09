import { afterEach, describe, expect, test } from "bun:test";
import { closeSync, mkdtempSync, openSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { registerRoom, deregisterRoom, listRooms, listLiveRooms } from "../../src/installer/registry";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let dir: string;
let registryPath: string;
let activeHandle: ServeHandle | undefined;

function setup() {
  dir = mkdtempSync(join(tmpdir(), "roomyx-registry-test-"));
  registryPath = join(dir, "registry.json");
}

afterEach(async () => {
  await activeHandle?.close();
  activeHandle = undefined;
  rmSync(dir, { recursive: true, force: true });
});

describe("registry", () => {
  test("registerRoom generates an id and persists the entry", () => {
    setup();
    const entry = registerRoom(registryPath, { port: 12345, logPath: FIXTURE, pid: process.pid });
    expect(entry.id).toMatch(/^r-[a-z0-9]+$/);
    const rooms = listRooms(registryPath);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.id).toBe(entry.id);
    expect(rooms[0]?.port).toBe(12345);
  });

  test("registerRoom on a fresh path creates the file with schemaVersion", () => {
    setup();
    registerRoom(registryPath, { port: 1, logPath: FIXTURE, pid: 1 });
    const rooms = listRooms(registryPath);
    expect(rooms).toHaveLength(1);
  });

  test("deregisterRoom removes exactly that entry, leaves others", () => {
    setup();
    const a = registerRoom(registryPath, { port: 1, logPath: FIXTURE, pid: 1 });
    const b = registerRoom(registryPath, { port: 2, logPath: FIXTURE, pid: 2 });
    deregisterRoom(registryPath, a.id);
    const rooms = listRooms(registryPath);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.id).toBe(b.id);
  });

  test("listRooms on a nonexistent registry file returns an empty array, not an error", () => {
    setup();
    expect(listRooms(join(dir, "does-not-exist.json"))).toEqual([]);
  });

  test("listLiveRooms performs a real liveness check: a real serve() instance is live, a dead port is pruned", async () => {
    setup();
    activeHandle = await serve(FIXTURE, { port: 0 });
    const live = registerRoom(registryPath, { port: activeHandle.port, logPath: FIXTURE, pid: process.pid });
    // Register a second entry pointing at a port nothing is listening on.
    const dead = registerRoom(registryPath, { port: 1, logPath: FIXTURE, pid: 999999 });

    const result = await listLiveRooms(registryPath);
    expect(result.map((r) => r.id)).toEqual([live.id]);

    // Pruned from the persisted file too, not just the returned list.
    const persisted = listRooms(registryPath);
    expect(persisted.map((r) => r.id)).toEqual([live.id]);
    expect(persisted.find((r) => r.id === dead.id)).toBeUndefined();
  });

  test("survives genuinely concurrent registerRoom calls from separate OS processes, no lost updates (regression, real subprocess concurrency)", async () => {
    setup();
    const N = 20;
    const workerScript = join(dir, "worker.ts");
    writeFileSync(
      workerScript,
      `
      import { registerRoom } from ${JSON.stringify(join(import.meta.dir, "..", "..", "src", "installer", "registry.ts"))};
      registerRoom(${JSON.stringify(registryPath)}, { port: 1, logPath: ${JSON.stringify(FIXTURE)}, pid: process.pid });
      `,
    );

    const procs = Array.from({ length: N }, () =>
      Bun.spawn(["bun", workerScript], { stdout: "pipe", stderr: "pipe" }),
    );
    const exits = await Promise.all(procs.map((p) => p.exited));
    expect(exits.every((code) => code === 0)).toBe(true);

    const rooms = listRooms(registryPath);
    expect(rooms).toHaveLength(N);
    // Every id genuinely distinct — a lost update would show fewer than N.
    expect(new Set(rooms.map((r) => r.id)).size).toBe(N);
  });

  test("reclaims a stale lockfile left behind by a crashed process, instead of blocking forever (regression)", () => {
    setup();
    const lockPath = `${registryPath}.lock`;
    closeSync(openSync(lockPath, "wx"));
    // Backdate it well past any process's plausible hold time on the tiny
    // critical section this lock guards.
    const old = new Date(Date.now() - 60_000);
    utimesSync(lockPath, old, old);

    const start = Date.now();
    const entry = registerRoom(registryPath, { port: 1, logPath: FIXTURE, pid: 1 });
    const elapsed = Date.now() - start;

    // Reclaimed quickly, not stuck out to the 5s wait-for-lock deadline.
    expect(elapsed).toBeLessThan(2000);
    expect(listRooms(registryPath).map((r) => r.id)).toEqual([entry.id]);
  });
});
