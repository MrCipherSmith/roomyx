import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

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
 * running processes.
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

export interface WriterLease {
  token: string;
  pid: number;
  /** Epoch ms of the last heartbeat, so staleness needs no file mtime. */
  at: number;
}

export type LeaseState =
  | { held: true; lease: WriterLease }
  | { held: false; reason: "absent" | "stale" };

export function writerLeasePathFor(registryPath: string): string {
  return `${registryPath}.writer`;
}

function parseLease(raw: string): WriterLease | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<WriterLease>;
    if (typeof parsed.token !== "string" || parsed.token === "") return undefined;
    if (typeof parsed.pid !== "number" || typeof parsed.at !== "number") return undefined;
    return { token: parsed.token, pid: parsed.pid, at: parsed.at };
  } catch {
    return undefined;
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
  const now = options.now ?? Date.now();
  if (now - lease.at > LEASE_STALE_MS) return { held: false, reason: "stale" };
  return { held: true, lease };
}

/** Takes the lease unconditionally, replacing whatever was there. */
export function acquireWriterLease(path: string, options: { pid: number; now?: number }): WriterLease {
  mkdirSync(dirname(path), { recursive: true });
  const lease: WriterLease = {
    token: randomUUID(),
    pid: options.pid,
    at: options.now ?? Date.now(),
  };
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

/** Unlinks only the lease this token wrote — see the note above. */
export function releaseWriterLease(path: string, token: string): void {
  try {
    const lease = parseLease(readFileSync(path, "utf8"));
    if (lease?.token === token) unlinkSync(path);
  } catch {
    // Already gone, or unreadable: nothing more to do.
  }
}
