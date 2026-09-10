import { afterEach, describe, expect, test } from "bun:test";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import {
  registerRoom,
  deregisterRoom,
  listRooms,
  listLiveRooms,
  releaseLockIfOwned,
} from "../../src/installer/registry";

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

  // The test above passes a missing FILE in a directory that exists, which is
  // why it never caught this: the reads take a lock by writing a lockfile next
  // to the registry, and that write is what fails when the DIRECTORY is also
  // missing. In an un-`init`ed project `roomyx rooms list` printed a bare
  // ENOENT and `roomyx-client` printed a stack trace. Regression, published in
  // 0.2.0.
  describe("un-initialized project: no .roomyx/rooms directory at all", () => {
    test("listRooms returns empty and creates nothing", () => {
      setup();
      const uninitialized = join(dir, ".roomyx", "rooms", "registry.json");
      expect(listRooms(uninitialized)).toEqual([]);
      expect(existsSync(join(dir, ".roomyx"))).toBe(false);
    });

    test("listLiveRooms returns empty and creates nothing", async () => {
      setup();
      const uninitialized = join(dir, ".roomyx", "rooms", "registry.json");
      expect(await listLiveRooms(uninitialized)).toEqual([]);
      expect(existsSync(join(dir, ".roomyx"))).toBe(false);
    });

    test("deregisterRoom is a no-op rather than a throw", () => {
      setup();
      const uninitialized = join(dir, ".roomyx", "rooms", "registry.json");
      expect(() => deregisterRoom(uninitialized, "r-nothing")).not.toThrow();
      expect(existsSync(join(dir, ".roomyx"))).toBe(false);
    });

    test("registerRoom creates the directory it needs and registers", () => {
      setup();
      const uninitialized = join(dir, ".roomyx", "rooms", "registry.json");
      const entry = registerRoom(uninitialized, { port: 1, logPath: FIXTURE, pid: 1 });
      expect(listRooms(uninitialized).map((r) => r.id)).toEqual([entry.id]);
    });
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

  test("release does not delete a lock reclaimed by someone else while the original holder was merely slow (regression)", () => {
    setup();
    const lockPath = `${registryPath}.lock`;
    writeFileSync(lockPath, "some-other-processes-token");

    // A holder finishing after its own lock was reclaimed as "stale" must not
    // blow away whichever different process now legitimately holds it.
    releaseLockIfOwned(lockPath, "our-own-stale-token");

    expect(readFileSync(lockPath, "utf8")).toBe("some-other-processes-token");
  });

  test("release does remove the lock when it still holds our own token", () => {
    setup();
    const lockPath = `${registryPath}.lock`;
    writeFileSync(lockPath, "our-token");

    releaseLockIfOwned(lockPath, "our-token");

    expect(existsSync(lockPath)).toBe(false);
  });
});

describe("liveness is about this room, not about that port", () => {
  test("an entry whose process is gone is dead, even with a server answering on its port", async () => {
    // Every `roomyx serve` defaults to 4319, so a room that died without
    // deregistering used to be resurrected as live by the next room to bind the
    // port — and then `roomyx-client --room <dead-id>` silently rendered a
    // different room's transcript under the dead room's id, while `room append`
    // refused a log nothing was serving. The pid was in the registry all along
    // and was never read.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-liveness-"));
    const registryPath = join(dir, "registry.json");
    const handle = await serve(FIXTURE, { port: 0 });

    try {
      // The live entry names the log the server is actually serving, because
      // liveness now asks the server which room it is rather than only whether
      // it answers.
      const alive = registerRoom(registryPath, { port: handle.port, logPath: FIXTURE, pid: process.pid });
      // Same port, a pid that cannot exist.
      const deadPid = registerRoom(registryPath, {
        port: handle.port,
        logPath: FIXTURE,
        pid: 0x7ffffff0,
      });
      // Same port, a live pid, but a different room — the port-reuse case that
      // the pid check alone could not catch.
      const otherRoom = registerRoom(registryPath, {
        port: handle.port,
        logPath: "/rooms/some-other-room.jsonl",
        pid: process.pid,
      });

      const live = await listLiveRooms(registryPath);
      const ids = live.map((room) => room.id);
      expect(ids).toContain(alive.id);
      expect(ids).not.toContain(deadPid.id);
      expect(ids).not.toContain(otherRoom.id);
    } finally {
      await handle.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});
