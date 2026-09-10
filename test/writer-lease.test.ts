import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { LeaseState } from "../src/writer-lease";
import {
  LEASE_STALE_MS,
  acquireWriterLease,
  readWriterLease,
  refreshWriterLease,
  releaseWriterLease,
  writerLeasePathFor,
} from "../src/writer-lease";

/**
 * The lease is what makes `room append` able to tell "a live room" from "a live
 * room with someone writing into it" — the distinction the old refusal admitted
 * it could not make, and which `--force` existed to paper over.
 *
 * It is modelled on `lockfile.ts` rather than invented: same owner-token rule
 * (release must not unlink a successor's file), same staleness ceiling, plus the
 * one thing a lock does not need — the holder is long-lived and has to prove it
 * is still there, so a holder that dies leaves a lease that expires rather than
 * one that blocks forever.
 */

/** Narrowing helpers, so a case can state what it expects without a cast. */
function dirnameOf(p: string): string {
  return dirname(p);
}

function reasonOf(state: LeaseState): string {
  return state.held ? "held" : state.reason;
}
function pidOf(state: LeaseState): number | undefined {
  return state.held ? state.lease.pid : undefined;
}

function temp(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "roomyx-lease-"));
  return { dir, path: writerLeasePathFor(join(dir, "registry.json"), join(dir, "room.jsonl")) };
}

describe("the writer lease", () => {
  test("it lives beside the registry, not beside the log", () => {
    // A room log travels with the repository; a lease must not. Whoever holds
    // the pen is a property of this machine's running processes.
    const registry = join(tmpdir(), "proj", ".roomyx", "rooms", "registry.json");
    const lease = writerLeasePathFor(registry, join(tmpdir(), "proj", "room.jsonl"));
    expect(lease.startsWith(join(tmpdir(), "proj", ".roomyx", "rooms"))).toBe(true);
    expect(lease).not.toContain(".jsonl");
  });

  test("two rooms in one project get two leases", () => {
    // A project runs several rooms at once — `serve` defaults to an ephemeral
    // port precisely so it can. One lease file per registry meant the first
    // room's writer refused every write to the second room's log.
    const registry = join(tmpdir(), "proj", ".roomyx", "rooms", "registry.json");
    const first = writerLeasePathFor(registry, join(tmpdir(), "proj", "a.jsonl"));
    const second = writerLeasePathFor(registry, join(tmpdir(), "proj", "b.jsonl"));
    expect(first).not.toBe(second);
    expect(dirnameOf(first)).toBe(dirnameOf(second));
  });

  test("a take-over replaces the token, so the previous holder cannot revive it", () => {
    // The defect this pins: take-over wrote no lease at all, so a writer that
    // was merely paused refreshed the lease it still held and two processes
    // wrote the same log.
    const { dir, path } = temp();
    const paused = acquireWriterLease(path, { pid: 11, now: 1_000 });
    const taker = acquireWriterLease(path, { pid: 22, now: 2_000, takeOverFrom: { pid: 11, at: 1_000 } });
    expect(refreshWriterLease(path, paused.token, { now: 2_500 })).toBe(false);
    const state = readWriterLease(path, { now: 2_500 });
    expect(state.held && state.lease.pid).toBe(22);
    expect(state.held && state.lease.token).toBe(taker.token);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a fresh lease reads as held, with its holder", () => {
    const { dir, path } = temp();
    const acquired = acquireWriterLease(path, { pid: 4321 });
    const state = readWriterLease(path);
    expect(state.held).toBe(true);
    expect(pidOf(state)).toBe(4321);
    expect(state.held && state.lease.token).toBe(acquired.token);
    rmSync(dir, { recursive: true, force: true });
  });

  test("an absent lease reads as not held, and says which absence it is", () => {
    const { dir, path } = temp();
    const state = readWriterLease(path);
    expect(state.held).toBe(false);
    // "nobody ever took it" and "someone took it and died" are different facts:
    // the first is the ordinary bare-server case, the second is the one that
    // `--take-over` exists for.
    expect(reasonOf(state)).toBe("absent");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a lease nobody refreshed for longer than the ceiling reads as stale", () => {
    const { dir, path } = temp();
    const start = 1_000_000;
    acquireWriterLease(path, { pid: 4321, now: start });
    expect(readWriterLease(path, { now: start + LEASE_STALE_MS - 1 }).held).toBe(true);
    const stale = readWriterLease(path, { now: start + LEASE_STALE_MS + 1 });
    expect(stale.held).toBe(false);
    expect(reasonOf(stale)).toBe("stale");
    // And it still says who stopped writing, which is what a take-over records.
    expect(!stale.held && stale.reason === "stale" && stale.last.pid).toBe(4321);
    rmSync(dir, { recursive: true, force: true });
  });

  test("refreshing keeps it held past the original ceiling; a wrong token cannot", () => {
    const { dir, path } = temp();
    const start = 2_000_000;
    const lease = acquireWriterLease(path, { pid: 1, now: start });
    expect(refreshWriterLease(path, lease.token, { now: start + LEASE_STALE_MS - 1000 })).toBe(true);
    // Past the ORIGINAL deadline, but the refresh moved it.
    expect(readWriterLease(path, { now: start + LEASE_STALE_MS + 1000 }).held).toBe(true);
    expect(refreshWriterLease(path, "not-my-token", { now: start + LEASE_STALE_MS + 2000 })).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("release only unlinks the lease this call itself wrote", () => {
    // The exact failure `releaseLockIfOwned` exists to prevent: a slow holder
    // finishing late must not delete the successor's file.
    const { dir, path } = temp();
    const mine = acquireWriterLease(path, { pid: 1 });
    const successor = acquireWriterLease(path, { pid: 2 });
    releaseWriterLease(path, mine.token);
    expect(existsSync(path)).toBe(true);
    expect(pidOf(readWriterLease(path))).toBe(2);
    releaseWriterLease(path, successor.token);
    expect(existsSync(path)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a corrupt lease file is treated as no lease, not as a held one", () => {
    // Failing closed here would refuse writes forever on a file nobody can
    // repair; failing open is the same answer as absent, which is what the
    // operator would get after deleting it.
    const { dir, path } = temp();
    // The lease lives in a `writers/` directory that only a take-over creates.
    mkdirSync(join(dir, "writers"), { recursive: true });
    writeFileSync(path, "{ not json");
    const state = readWriterLease(path);
    expect(state.held).toBe(false);
    expect(reasonOf(state)).toBe("absent");
    // And it can be re-taken over the wreckage.
    expect(acquireWriterLease(path, { pid: 7 }).pid).toBe(7);
    expect(JSON.parse(readFileSync(path, "utf8")).pid).toBe(7);
    rmSync(dir, { recursive: true, force: true });
  });
});
