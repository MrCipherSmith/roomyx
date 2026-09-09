import { readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";

/**
 * A lock older than this could only mean its holder crashed — the critical
 * sections here are a few synchronous file ops, never anywhere close to 30s.
 */
const STALE_LOCK_MS = 30_000;

/**
 * Exported narrowly so the ownership check can be unit-tested directly, without
 * needing to choreograph real inter-process timing to hit it.
 */
export function releaseLockIfOwned(lockPath: string, token: string): void {
  try {
    if (readFileSync(lockPath, "utf8") === token) {
      unlinkSync(lockPath);
    }
  } catch {
    // Already gone, or unreadable — nothing more to do.
  }
}

/**
 * Blocks (synchronously) until an exclusive lockfile can be created, runs `fn`,
 * then always releases the lock.
 *
 * Three rounds of independent review are baked into this, which is why it was
 * worth extracting rather than writing a second one. Without a lock at all,
 * concurrent writers lose updates to a read-modify-write race and can crash
 * each other with a JSON parse error on a torn read. `Atomics.wait` is used for
 * the retry backoff because the callers are synchronous APIs; an async lock
 * would leak into every caller's signature for no benefit.
 *
 * A process that crashes mid-critical-section would otherwise leave the
 * lockfile behind forever, blocking every future caller rather than only the
 * one racing the crash — so a lock older than `STALE_LOCK_MS` is reclaimed
 * instead of waited on.
 *
 * The lockfile's content is an owner token (pid + random), not empty: reclaiming
 * by mtime alone is not enough, because a holder that was merely slow rather
 * than crashed would, on finishing, unconditionally delete whichever *other*
 * process's lock now legitimately occupies that path. Release only unlinks when
 * the file still holds the token this call itself wrote.
 *
 * It guarded the registry for three rounds while the room log — the actual
 * data — had nothing: three concurrent `roomyx room append` calls all allocated
 * `seq: 1` and all three landed on disk. `seq` is the transcript cursor, so a
 * client polling between two colliding writes advances past both and never
 * receives the second message, which is on disk and invisible forever.
 */
export function withLock<T>(targetPath: string, fn: () => T): T {
  const lockPath = `${targetPath}.lock`;
  const token = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      writeFileSync(lockPath, token, { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
          try {
            unlinkSync(lockPath);
          } catch {
            // Another process already reclaimed it first; just retry.
          }
          continue;
        }
      } catch {
        // Lock vanished between the failed open and this stat; retry.
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for the lock at ${lockPath}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try {
    return fn();
  } finally {
    releaseLockIfOwned(lockPath, token);
  }
}
