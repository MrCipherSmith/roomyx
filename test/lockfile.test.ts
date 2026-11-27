import { afterEach, describe, expect, test } from "bun:test";
import { closeSync, mkdtempSync, openSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withLock } from "../src/lockfile";

/** Not exported by `src/lockfile.ts`; mirrored here because the case is about it. */
const STALE_LOCK_MS = 30_000;

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/**
 * The reclaim `withLock` promises and cannot reach.
 *
 * Its own comment says a lock older than `STALE_LOCK_MS` (30s) "is reclaimed
 * instead of waited on". The wait deadline is `Date.now() + 5000`. So a waiter
 * that arrives more than five seconds before the lock becomes stale gives up
 * first: it throws "Timed out waiting for the lock" and the reclaim path is
 * unreachable for most of the window it exists for.
 *
 * `test/installer/registry.test.ts` has a stale-reclaim regression case, and it
 * passes: it backdates the lock by 60 seconds, which is already past the ceiling
 * on the first iteration. The gap between the two deadlines is invisible to it,
 * because the only age it ever asks about is one the loop reclaims immediately.
 *
 * The caller that pays is `appendMessage`: a `roomyx room append` killed
 * mid-write makes appends into that room fail for the next half minute, five
 * seconds at a time, on a lock every one of them was entitled to take.
 */
describe("withLock against a lock its holder crashed under", () => {
  test("a lock aged inside the stale window is reclaimed rather than timed out on", () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-lockfile-"));
    const target = join(dir, "room.jsonl");
    writeFileSync(target, "");
    const lockPath = `${target}.lock`;
    closeSync(openSync(lockPath, "wx"));

    // Aged, not waited for — `utimesSync` is why this case runs in seconds
    // instead of thirty of them. 23s is chosen as the *shortest* age the two
    // deadlines still disagree about: the holder is provably crashed (a critical
    // section here is a few synchronous file ops), the lock is inside the 30s
    // ceiling, and the 7s that remain are more than the 5s the waiter allows
    // itself. Anything closer to the ceiling would be reclaimed by the current
    // code too, and would assert nothing.
    const aged = new Date(Date.now() - 23_000);
    utimesSync(lockPath, aged, aged);

    const start = Date.now();
    expect(withLock(target, () => "ran")).toBe("ran");
    // A waiter must not sit out longer than the staleness ceiling it is waiting
    // for — that would be a deadline that never becomes reachable, in the other
    // direction.
    expect(Date.now() - start).toBeLessThan(STALE_LOCK_MS);
  }, 60000);
});
