# Task definitions

Status lives in `flow.json` and moves only through the CLI. This file defines
what each task means and which acceptance criteria it must satisfy.

`T1`–`T4` are the scaffold tasks `flow init` writes. `T1` is satisfied by the
audit and `context.md`; `T2`–`T4` are superseded by the specific tasks below and
are closed with a recorded reason rather than left open.

## Wave A — the five P0 defects

**T5 · test** — One failing test per P0 defect, each of which must fail on the
current code before its fix lands:
(a) `append` → `--take-over` → `append` and assert the third call exits 0;
(b) a crafted line at the `seq` ceiling leaves the room writable;
(c) `withLock` against a lock file with an old mtime acquires rather than times
out; (d) N throwing `onOwnerCommand` handlers leave zero pending;
(e) a throwing `cleanup()` still reaches `exit()`, and a rejecting `close()`
exits non-zero. → AC1, AC5, AC6, AC7, AC8

**T6 · implement** — `src/cli.ts:493`, `src/writer-lease.ts`,
`src/server/serve.ts:89`. A one-shot append stops holding a lease nothing
releases. `writerPresent` consults `isPidAlive` (`registry.ts:255`). `parseLease`
round-trips `takenOverFrom`. The heartbeat path tells a stale lease apart from a
displaced one and does not clear itself on the first stall.
Keep D-01/D-01a intact: this removes an inert guard, it does not weaken the
single-writer invariant. → AC1, AC2, AC3, AC4

**T7 · implement** — `src/log/schema.ts:91` gains an upper bound on `seq`;
`nextSeq` refuses an out-of-range recorded value rather than building on it. The
bound belongs in the schema, per D-08. → AC5

**T8 · implement** — `src/lockfile.ts:54`: deadline becomes
`max(5000, STALE_LOCK_MS - lockAge)` so a waiter can reach the reclaim it is
entitled to. → AC6

**T9 · implement** — `src/server/index.ts:197`: settle the queue entry whether
the handler resolves or throws. → AC7

**T10 · implement** — `src/server/shutdown.ts:34` and
`src/client/shutdown.ts:34`: `cleanup()` cannot prevent `exit()`, and a
rejecting `close()` exits non-zero. → AC8

**T11 · verify** — Confirm each T5 test failed before its fix and passes after;
whole suite green.

## Wave B — the security items

**T12 · test** — Failing tests for: a symlinked `.bak` leaving the victim file
untouched; `ensureMcpServer` against `[1,2]`, `null` and
`{"mcpServers":"notanobject"}`; `limit: 0` refused; an `initialize` without the
room token refused. → AC9, AC10, AC11, AC12

**T13 · implement** — `src/installer/skill-sync.ts:127`: `lstat` the target and
the `.bak` path, refuse a symlink by name, write with `O_NOFOLLOW`. → AC9

**T14 · implement** — `src/installer/init-apply.ts:136`: refuse a parsed value
that is not a plain object with the existing "left untouched" wording; write
temp-then-rename as `registry.ts` does. `src/server/index.ts:113`: `limit`
becomes `min(1)`. → AC11, AC12

**T15 · implement** — Per-room token: minted at `serve()`, stored in the
registry entry, required by `http-transport`, and sent by `RoomClient`,
`callRoomTool`, `probeRoomState` and the liveness probe. Not authentication of a
person — it bounds which local processes can drive the room. → AC10

**T16 · docs** — D-06b in `docs/roomyx/decisions.md`, written in D-06a's shape:
what changed in the threat model (the owner-command queue converts read access
into instruction access to an agent holding tools), what the token covers, and
what it does not. Plus `SECURITY.md` at the repository root naming a private
disclosure path and the tool's write footprint into agent config directories.
→ AC10, AC17

**T17 · verify** — A real `serve` + `RoomClient` + liveness-probe round trip.
The failure mode for a missed call site is a room reporting `unknown` liveness,
not a red test — so this is driven end to end, per the D-06a precedent where
`allowedHosts` silently refused roomyx's own client.

## Wave C — the measured performance work

**T18 · test** — A benchmark harness reusing the audit's synthetic-room method,
plus tests that a second `loadRoomLog` of an unchanged file does not re-read it
*and* that a changed file is re-read. Both halves, because a wrong invalidation
fails silently. → AC13

**T19 · implement** — `src/log/store.ts:28` caches by `(mtimeMs, size)`;
`src/log/write.ts:71` reads the tail instead of the whole log; `foldEdits`
(`store.ts:108`) skips its sort when no edit-kind message is present. Allocation
and write stay one critical section, per D-10. Closes R10's open half. → AC13

**T20 · verify** — Record the before/after numbers in `journal.md` using the
same benchmark, so the claim is reproducible rather than asserted.

## Wave D — small verified wins, review, documentation

**T21 · implement** — `src/client/owner-prompt.ts:1` imports from
`../server/owner-queue` (or a leaf module) instead of `../server/index`;
`src/installer/init-apply.ts:89` uses `.roomyx/rooms/**/*.lock`; both
`Math.max(...)` spreads (`write.ts:77`, `store.ts:148`) become `reduce` — as
hygiene, the reported 125k threshold was wrong. → AC14, AC15

**T22 · implement** — `scripts/soak.ts` runs from a GitHub workflow with a
bounded budget, and a failure fails the job. → AC16

**T23 · verify** — `bun run lint`, `bun run typecheck`, whole suite; the
`test.failing` wrap tripwire still present and still failing-by-design; no test
weakened or deleted. → AC18

**T24 · review** — `review-orchestrator` over the accumulated diff. Check the
fan-out budget first (`keryx review budget`).

**T25 · docs** — `CHANGELOG.md` entry with the version decided under D-13 (the
token changes the wire contract for an external client, so this is the version
question, not a formality); retire `docs/roomyx/improvement-backlog.md` with a
pointer to what replaced it; commit `docs/roomyx/audit-2026-09-27.md`; correct
`ACTIONS.md`'s D-18 triage table, which omits item 7. → AC19
