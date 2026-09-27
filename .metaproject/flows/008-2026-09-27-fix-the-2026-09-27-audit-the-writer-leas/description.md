# Fix the 2026-09-27 audit

## Problem

A nine-pass audit of `@mrciphersmith/roomyx@0.12.2` (`docs/roomyx/audit-2026-09-27.md`)
found the project structurally sound — no import cycles, correct dependency
direction, a strong release pipeline, 25 of 26 backlog items genuinely done —
with the defects clustered in three places.

**Cluster 1 — the writer lease is actively harmful.** `cli.ts:493` acquires a
writer lease in a process that exits milliseconds later, and
`releaseWriterLease` is called nowhere outside `serve.ts:107`. One
`room append --take-over` therefore locks the room out of writes permanently:
30s of *"A writer is live — pid <already dead>"*, then *"pass `--take-over`"*
forever, each take-over writing a spurious `owner`/`status` line and re-arming
the trap. Found independently by the concurrency pass and the logic pass, each
reproducing it, and confirmed structurally against the call sites.

Three further signs the lease is the weakest invariant in the tree: `isPidAlive`
exists in `registry.ts:255` and the lease path never calls it; `parseLease`
drops `takenOverFrom`, so the first heartbeat erases the provenance that field
exists to carry; and staleness collapses "I fell behind" and "I was displaced"
into one `false`, so a 30s suspend is reported as a take-over and the heartbeat
is cleared permanently.

**Cluster 2 — the log is re-read in full on every operation.** Measured:
`loadRoomLog` costs 50 ms at 20,000 messages against 0.6 ms for the tail
actually needed, and `nextSeq` re-parses the whole log on every append *inside
the lock* (46.89 ms at 20,000), making room population O(n²) and lengthening the
critical section as the room grows. The knock-on effect is not just latency: a
concurrent `probeRoomState` on its 500 ms budget times out, `checkRoomLiveness`
returns `unknown`, and `room append`'s guard receives `dispatched === undefined`
— so an append is allowed into a room whose dispatcher is alive and merely busy.
This is also the single item still open in `improvement-backlog.md` (R10's
memoisation half), deferred pending a measurement that has now been taken.

**Cluster 3 — the trust boundary on the MCP port.** D-06 decided there is no
token in v1, on the argument that the threat is bounded by the operator's local
machine at the same trust level as the process that started the server. That
holds for reading. It does not hold for the owner-command queue: reproduced live
with plain `curl` and no credential, `room.post_owner_command` accepts a
`constraint` body and it comes straight back out of
`room.get_pending_owner_commands` — the queue the bundled skill instructs the
dispatcher agent to poll and obey. A local process at the same trust level
therefore gains not data but the ability to issue instructions to an agent that
holds tools. D-06 enumerated the actors but not this escalation.

Alongside these, a set of small confirmed defects: a `seq` field with no upper
bound, so one crafted line bricks a room forever; a lock whose 5s wait deadline
can never reach its own 30s stale reclaim; a leaked owner-queue slot on a
throwing handler; a `cleanup()` that throws inside `.finally()` and skips
`exit()` entirely; a symlink-following backup in `skill-sync`; an MCP config
rewrite that casts arbitrary JSON; `limit: 0` producing a non-terminating cursor
loop; an installer-written `.gitignore` that misses every room-log lockfile; and
one import that drags the whole MCP server SDK into the TUI process for a
four-element string array.

## Expected outcome

Every P0 through P3 item of the audit is fixed, each with a test that fails
before the fix, and the project's measured ceilings are raised rather than
merely asserted. `soak.ts` — which exists because the three worst defects this
project shipped were invisible to unit tests by construction — runs
automatically. The one open backlog item is closed and the backlog retired.

## Out of scope

The audit's **P4** items, which are structural and want planning rather than
doing under a defect flow:

- moving the single-writer decision out of `cli.ts` into the core (the root
  cause behind cluster 1 — this flow fixes the symptom deliberately, and says so);
- splitting `cli.ts` (980 lines, four responsibilities, `main()` at import);
- splitting `installer/` into `installer/` + `rooms/`, and moving
  `writer-lease.ts` with it;
- publishing the core as a library (`exports` map);
- giving the MCP wire contract a home in `src/protocol/`;
- idempotency keys on `appendMessages`;
- tolerating a torn tail on read.

Also out of scope: deprecating the six early npm versions (owner action on a
credential this flow does not hold), and recovering the lost 2026-09-12 room
archive.
