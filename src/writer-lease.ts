import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

/**
 * Who is holding the pen on a room log, as a fact rather than an inference.
 *
 * `room append` used to infer it: if the registry showed a room answering on
 * this path, the CLI refused and told the operator to pass `--force` if they
 * knew better. That inference is wrong in the case that matters most — a room
 * served by bare `roomyx serve` answers and has no dispatcher, so there is no
 * writer to race, and the bundled skill had to instruct its primary consumer to
 * write through the guard's own escape hatch to get any work done.
 *
 * A lease fixes the inference. It is held by a server that has a dispatcher
 * attached — same process, same lifetime — and by nothing else. A one-shot
 * `roomyx room append` never holds one: it would be expired by the time anyone
 * could read it, which is the state a lease exists to distinguish.
 *
 * That last sentence was a comment and not code until the 2026-09-27 audit.
 * `room append --take-over` *acquired* a lease and then exited, so it left a
 * fresh hold owned by a pid that no longer existed — read as `held` for the next
 * `LEASE_STALE_MS` and as `stale` (i.e. "pass `--take-over`") forever after.
 * Each recovery re-armed the refusal it was recovering from. A one-shot writer
 * now leaves a **tombstone** instead: a record that replaces the displaced token
 * without claiming a live hold (`tombstoneWriterLease`), which is the one thing
 * the take-over actually needed the write for.
 *
 * Two rules copied deliberately from `lockfile.ts` rather than re-derived:
 *
 * - **Release checks the token.** A holder that finishes late must not unlink
 *   the file its successor legitimately took.
 * - **Staleness is a ceiling, not a guess.** A holder that dies without saying
 *   so leaves a lease that expires by itself, so recovery never requires an
 *   operator to delete a file by hand.
 *
 * The lease lives beside the registry, not beside the log: a room log travels
 * with the repository, while who holds the pen is a property of this machine's
 * running processes. It is keyed by the **log**, though — one file per room —
 * because a project runs several rooms at once (the README's whole point in
 * giving `serve` an ephemeral port default), and a single lease file shared by
 * all of them meant the first room's writer refused writes to the second's log.
 */

/** How often a holder re-states that it is still there. */
export const LEASE_HEARTBEAT_MS = 5_000;

/**
 * How long a lease is believed without a heartbeat.
 *
 * Six missed heartbeats. Longer than any plausible scheduling stall, and short
 * enough that a crashed dispatcher does not block the operator for minutes.
 */
export const LEASE_STALE_MS = 30_000;

/**
 * The lease record on disk, described once so it cannot be narrowed by accident.
 *
 * `parseLease` used to rebuild `{token, pid, at}` by hand and dropped
 * `takenOverFrom`, so the first heartbeat after a take-over — five seconds later
 * — wrote the narrowed object back and erased the provenance the field exists to
 * carry. A schema is used rather than a hand-written check precisely because the
 * hand-written one silently omitted a field: adding one here makes it
 * round-trip, and a reader that forgets it can no longer be the reason it is
 * lost.
 */
const writerLeaseSchema = z.object({
  token: z.string().min(1),
  pid: z.number(),
  /** Epoch ms of the last heartbeat, so staleness needs no file mtime. */
  at: z.number(),
  /**
   * A tombstone: the token is replaced, and nobody is holding what replaced it.
   * Written by a writer that has finished (a one-shot `room append --take-over`)
   * rather than by one that is still there.
   */
  released: z.literal(true).optional(),
  /**
   * Set when a writer took this lease over from one that had stopped — the pid
   * that did it, and when. It is why the token is replaced on take-over: the
   * previous holder's heartbeat has to fail, or a writer that was merely paused
   * revives the lease it lost and two processes write the same log.
   */
  takenOverFrom: z.object({ pid: z.number(), at: z.number() }).optional(),
});

export type WriterLease = z.infer<typeof writerLeaseSchema>;

export type LeaseState =
  | { held: true; lease: WriterLease }
  /**
   * `stale` and `released` carry the lease they found, because "a writer stopped
   * here, pid N, at T" is the fact a take-over needs to record — and reading the
   * file only to discard who was in it leaves the log unable to say what it
   * displaced.
   */
  | { held: false; reason: "absent" }
  | { held: false; reason: "stale"; last: WriterLease }
  /**
   * Nobody holds it and nobody is expected to: a writer wrote, invalidated the
   * token it displaced, and finished. Distinct from `stale`, which means a
   * writer stopped **without** saying so — the case `--take-over` exists for. A
   * tombstone read as `stale` is how one deliberate recovery turned into a
   * permanent demand to keep recovering.
   */
  | { held: false; reason: "released"; last: WriterLease };

/**
 * One lease file per room, under a directory beside the registry.
 *
 * The file name is a hash of the log's absolute path: the log path is what
 * identifies the room, and a name derived from it keeps two rooms apart without
 * putting a path (which contains separators) into a file name.
 */
export function writerLeasePathFor(registryPath: string, logPath: string): string {
  const name = createHash("sha256").update(logPath).digest("hex").slice(0, 16);
  return join(dirname(registryPath), "writers", `${name}.json`);
}

function parseLease(raw: string): WriterLease | undefined {
  try {
    const parsed = writerLeaseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether the process named by a lease still exists.
 *
 * A held lease is a claim, not a fact: the claim is only worth anything while the
 * process that made it is running. Without this check a lease left behind by a
 * process that is gone refused every write to the room for the whole stale
 * window, naming a pid the operator could not find.
 *
 * The rule is deliberately the same as `registry.ts`'s own pid check, including
 * the "no pid recorded, so do not decide from this" fallback: an unusable pid
 * means this signal abstains, never that it fabricates an answer. It is
 * reimplemented rather than imported because that copy is private to the
 * registry and this module has no dependency on `installer/` — the audit's
 * structural item wants the two moved together, not coupled where they sit.
 */
export function isLeaseHolderAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means a process exists and is not ours to signal — still alive.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/**
 * A corrupt or half-written lease reads as **no lease**, never as a held one.
 *
 * Failing closed would mean a file nobody can repair refusing every write to a
 * room forever, and the operator's only recourse would be deleting the file by
 * hand — which is exactly the recovery path `--take-over` exists to make
 * unnecessary. `absent` is also the truthful answer: nothing usable is held.
 */
export function readWriterLease(path: string, options: { now?: number } = {}): LeaseState {
  if (!existsSync(path)) return { held: false, reason: "absent" };
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { held: false, reason: "absent" };
  }
  const lease = parseLease(raw);
  if (lease === undefined) return { held: false, reason: "absent" };
  // Released BEFORE stale, and it stays `released` however old it gets: a
  // tombstone is a statement that nobody is holding this, and ageing does not
  // turn it into "a writer stopped here without saying so".
  if (lease.released === true) return { held: false, reason: "released", last: lease };
  const now = options.now ?? Date.now();
  if (now - lease.at > LEASE_STALE_MS) return { held: false, reason: "stale", last: lease };
  return { held: true, lease };
}

/** Takes the lease unconditionally, replacing whatever was there. */
export function acquireWriterLease(
  path: string,
  options: { pid: number; now?: number; takeOverFrom?: { pid: number; at: number } },
): WriterLease {
  mkdirSync(dirname(path), { recursive: true });
  const lease: WriterLease = {
    token: randomUUID(),
    pid: options.pid,
    at: options.now ?? Date.now(),
  };
  if (options.takeOverFrom !== undefined) lease.takenOverFrom = options.takeOverFrom;
  writeFileSync(path, JSON.stringify(lease));
  return lease;
}

/**
 * Records a write that has already finished: a new token, held by nobody.
 *
 * This is what a one-shot `room append --take-over` leaves behind. It has to
 * write *something* — the point of replacing the token is that a writer which was
 * merely paused cannot refresh the lease it lost and start writing again beside
 * whoever displaced it — but it must not claim a hold, because the process making
 * the claim is about to exit and nothing would ever release it.
 *
 * `takeOverFrom` is kept on the record rather than only in the transcript: the
 * displaced holder's own heartbeat reads this file, and "you were taken over by
 * pid N" is the difference between reporting a displacement and guessing at one.
 */
export function tombstoneWriterLease(
  path: string,
  options: { pid: number; now?: number; takeOverFrom?: { pid: number; at: number } },
): WriterLease {
  mkdirSync(dirname(path), { recursive: true });
  const lease: WriterLease = {
    token: randomUUID(),
    pid: options.pid,
    at: options.now ?? Date.now(),
    released: true,
  };
  if (options.takeOverFrom !== undefined) lease.takenOverFrom = options.takeOverFrom;
  writeFileSync(path, JSON.stringify(lease));
  return lease;
}

/** Returns false when the lease is gone, expired, or now someone else's. */
export function refreshWriterLease(path: string, token: string, options: { now?: number } = {}): boolean {
  const state = readWriterLease(path, options);
  if (!state.held || state.lease.token !== token) return false;
  writeFileSync(path, JSON.stringify({ ...state.lease, at: options.now ?? Date.now() }));
  return true;
}

/**
 * What a live holder's heartbeat learns, which is not one bit of information.
 *
 * `refreshWriterLease` answers `false` to two completely different facts: "your
 * lease expired while you were not scheduled" and "someone else holds this now".
 * A holder that cannot tell them apart has to assume the worse one, so a
 * thirty-second stall — a suspended laptop, a stopped container, a long GC — was
 * reported as a take-over that never happened, and the heartbeat was cleared
 * permanently. The process went on writing with nothing refreshing its lease, and
 * its room became take-over-able while it was still the writer.
 *
 * - `refreshed` — still ours, deadline moved.
 * - `reacquired` — nothing and nobody else claims it, so we take it back with a
 *   fresh token. Falling behind is recoverable; it is not a displacement.
 * - `displaced` — the record belongs to someone else. This one is real, and the
 *   caller must stop being a writer rather than print advice about it.
 */
export type LeaseRenewal =
  | { outcome: "refreshed"; lease: WriterLease }
  | { outcome: "reacquired"; lease: WriterLease; staleFor: number }
  | { outcome: "displaced"; by: WriterLease };

export function renewWriterLease(
  path: string,
  token: string,
  options: { pid: number; now?: number },
): LeaseRenewal {
  const now = options.now ?? Date.now();
  const state = readWriterLease(path, { now });

  if (state.held) {
    if (state.lease.token !== token) return { outcome: "displaced", by: state.lease };
    const lease = { ...state.lease, at: now };
    writeFileSync(path, JSON.stringify(lease));
    return { outcome: "refreshed", lease };
  }

  // A tombstone is always a displacement, whoever wrote it: somebody took this
  // room over deliberately and said so. A holder that re-acquired over it would
  // undo the one act the tombstone exists to make stick.
  if (state.reason === "released") return { outcome: "displaced", by: state.last };
  if (state.reason === "stale" && state.last.token !== token) {
    return { outcome: "displaced", by: state.last };
  }

  // Absent, or expired and still ours: no other writer is claiming this log, so
  // re-arming the lease cannot produce a second one. The token is fresh, so a
  // reader that saw the expired one cannot refresh it back to life.
  const staleFor = state.reason === "stale" ? now - state.last.at : 0;
  return { outcome: "reacquired", lease: acquireWriterLease(path, { pid: options.pid, now }), staleFor };
}

/** Unlinks only the lease this token wrote — see the note above. */
export function releaseWriterLease(path: string, token: string): void {
  try {
    const lease = parseLease(readFileSync(path, "utf8"));
    if (lease?.token === token) unlinkSync(path);
  } catch {
    // Already gone, or unreadable: nothing more to do.
  }
}
