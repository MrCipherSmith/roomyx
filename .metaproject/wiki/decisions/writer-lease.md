# Writer lease

Version: 0.1.0
Type: decision
Status: draft

## Summary

A room log has exactly one writer while a room is live. The writer lease is the on-disk fact that says who that is: held by a server with a dispatcher attached, refreshed by heartbeat, and expiring by itself if the holder dies. One-shot CLI writers never hold one; they leave a tombstone.

## Questions this page must close

| # | Question | Coverage | Basis |
|---|----------|----------|-------|
| Q1 | Why a lease instead of inferring "someone is writing" from the registry? | covered | Module comment in `src/writer-lease.ts`: a room served by bare `roomyx serve` answers but has no dispatcher, so the inference refused a write nobody could race. |
| Q2 | Who holds a lease and for how long? | covered | `LEASE_HEARTBEAT_MS` 5s, `LEASE_STALE_MS` 30s (six missed heartbeats) in `src/writer-lease.ts`. |
| Q3 | What does a one-shot `room append --take-over` leave behind? | covered | `tombstoneWriterLease`; 2026-09-27 audit item recorded in the module comment. |
| Q4 | What happens when a holder stalls and comes back? | covered | `renewWriterLease` outcomes `refreshed`, `reacquired`, `displaced`. |
| Q5 | Where is the original decision record (D-01 / D-01a)? | partial | Referenced from `src/log/write.ts` and `docs/roomyx/decisions.md`; the text of D-01a was not re-read for this page. |

## Problem

D-01 keeps one writer per live room. `room append` enforced it by inference: if the registry showed a room answering on the log's path, the CLI refused and told the operator to pass `--force`. That is wrong in the case that matters most. A room started by bare `roomyx serve` answers but has no dispatcher, so there is no writer to race, and the bundled skill had to tell its main consumer to write through the escape hatch to get any work done.

## Chosen option

A lease file, one per room log, that exists only while a server with a dispatcher attached is running (same process, same lifetime).

- Location: `<registry dir>/writers/<sha256(logPath)[0..16]>.json`. Beside the registry, not the log, because the log travels with the repository and "who holds the pen" is a property of this machine's processes. Keyed by log so several rooms in one project do not block each other.
- Record (zod schema `writerLeaseSchema`): `token`, `pid`, `at` (epoch ms of last heartbeat), optional `released: true` (tombstone), optional `takenOverFrom: {pid, at}`.
- Read states: `held`, `absent`, `stale`, `released`. A corrupt or half-written file reads as `absent`, never as held.
- Holder heartbeat uses `renewWriterLease`: `refreshed` (still ours), `reacquired` (expired but nobody else claimed it, so take it back with a fresh token), `displaced` (someone else's record, or any tombstone: stop being a writer).
- Take-over replaces the token, so a merely paused previous holder's heartbeat fails instead of reviving the lease and producing two writers.
- Release unlinks only when the file still carries the releasing holder's token.

## Rejected alternatives and known reasons

- Registry-based inference with `--force`: rejected, see Problem. The reason is recorded in the module comment.
- A single lease file shared by all rooms: rejected after the first room's writer refused writes to the second room's log.
- A one-shot writer acquiring a normal lease: rejected after the 2026-09-27 audit. It left a fresh hold owned by a dead pid, read as `held` for 30s and as `stale` forever after, so each recovery re-armed the refusal it was recovering from. Replaced by the tombstone.
- Treating `refresh` returning false as "taken over": rejected. It conflated "expired while not scheduled" with "someone else holds it", so a 30s stall permanently cleared the heartbeat while the process kept writing. Replaced by the three-outcome `renewWriterLease`.
- Failing closed on a corrupt lease file: rejected, because the only recovery would be deleting the file by hand.

## Consequences

- Bare `serve` rooms accept CLI appends with no flag.
- A crashed dispatcher blocks writes for at most `LEASE_STALE_MS`; no manual cleanup.
- `isLeaseHolderAlive` abstains (returns alive) on an unusable pid rather than inventing an answer; it is a deliberate copy of the registry's private check to keep `writer-lease.ts` independent of `installer/`.
- The lease file is plain JSON written with `writeFileSync`, not atomically renamed; a torn read is handled by treating it as `absent`.
- Staleness is a ceiling, not proof: within the 30s window a live-looking lease of a dead process is still refused unless the pid check shows it gone.

## Constraints

- A one-shot command must never hold a lease; it writes a tombstone via `tombstoneWriterLease`.
- Anything that rewrites a lease must go through `writerLeaseSchema` so `takenOverFrom` is not dropped.
- Release must check the token.
- The append itself is still serialised by the log's lockfile; the lease decides who may try, the lock keeps concurrent appenders from colliding on `seq` (see [Seq allocation](../business-rules/seq-allocation.md)).

## Supersession

Ends if rooms gain a different single-writer mechanism (for example a server-side append API that makes CLI appends route through the live server). Nothing currently supersedes it.

## Related Code

- `src/writer-lease.ts`
- `src/lockfile.ts`
- `src/log/write.ts`
- `src/cli/room-append.ts`
- `test/writer-lease.test.ts`
- `test/cli-room-lease-ratchet.test.ts`

## Related Wiki

- [Seq allocation](../business-rules/seq-allocation.md)
- [Per-room token](room-token.md)
- [Wiki Index](../index.md)

## Changelog

- 0.1.0 - Initial version, written from `src/writer-lease.ts` and its module comments.
