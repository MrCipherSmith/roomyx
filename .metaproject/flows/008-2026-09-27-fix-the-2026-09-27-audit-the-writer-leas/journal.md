# Flow Journal

- 2026-09-27T19:54:55.641Z - flow created
- 2026-09-27T19:57:25.152Z - task-added: T5: Failing tests for the five P0 defects: lease ratchet, seq ceiling, lock deadline, owner-queue leak, shutdown exit
- 2026-09-27T19:57:25.480Z - task-added: T6: Stop a one-shot append holding a writer lease; consult isPidAlive; keep takenOverFrom; split stale from displaced
- 2026-09-27T19:57:25.823Z - task-added: T7: Bound seq in messageLineSchema and make nextSeq refuse an out-of-range recorded seq
- 2026-09-27T19:57:26.158Z - task-added: T8: Make the lock wait deadline reach its own stale reclaim
- 2026-09-27T19:57:26.500Z - task-added: T9: Settle the owner-queue entry when the handler throws
- 2026-09-27T19:57:26.844Z - task-added: T10: Always exit on shutdown; exit non-zero when close() rejected
- 2026-09-27T19:57:27.176Z - task-added: T11: Verify wave A: the five new tests fail before and pass after, suite green
- 2026-09-27T19:57:42.655Z - task-depends-set: T6: dependsOn T5 (was empty) — the scaffold T1 was a placeholder; the real precondition is the failing-test task T5
- 2026-09-27T19:57:43.066Z - task-depends-set: T7: dependsOn T5 (was empty) — the scaffold T1 was a placeholder; the real precondition is the failing-test task T5
- 2026-09-27T19:57:43.502Z - task-depends-set: T8: dependsOn T5 (was empty) — the scaffold T1 was a placeholder; the real precondition is the failing-test task T5
- 2026-09-27T19:57:43.878Z - task-depends-set: T9: dependsOn T5 (was empty) — the scaffold T1 was a placeholder; the real precondition is the failing-test task T5
- 2026-09-27T19:57:44.225Z - task-depends-set: T10: dependsOn T5 (was empty) — the scaffold T1 was a placeholder; the real precondition is the failing-test task T5
- 2026-09-27T19:57:44.620Z - task-depends-set: T11: dependsOn T6, T7, T8, T9, T10 (was empty) — wave A verification follows its five implementation tasks
- 2026-09-27T19:57:55.349Z - task-added: T12: Failing tests for wave B: symlink backup, MCP config shape, limit 0, unauthenticated initialize
- 2026-09-27T19:57:55.770Z - task-added: T13: Refuse a symlinked target or .bak path in skill-sync
- 2026-09-27T19:57:56.155Z - task-added: T14: Validate the MCP config shape before rewriting it, and write temp-then-rename; reject limit 0
- 2026-09-27T19:57:56.571Z - task-added: T15: Mint a per-room token at serve(), require it on the transport, send it from all four in-tree clients
- 2026-09-27T19:57:56.980Z - task-added: T16: Write D-06b and SECURITY.md
- 2026-09-27T19:57:57.342Z - task-added: T17: Verify wave B: a real serve + client + liveness-probe round trip, not only unit tests
- 2026-09-27T19:57:57.724Z - task-added: T18: Benchmark harness plus tests that an unchanged log is not re-read and a changed one is
- 2026-09-27T19:57:58.130Z - task-added: T19: Cache loadRoomLog by (mtimeMs,size); read the tail for nextSeq; skip the foldEdits sort with no edit kinds
- 2026-09-27T19:57:58.554Z - task-added: T20: Record the before/after measurement for the cache in journal.md
- 2026-09-27T19:57:59.040Z - task-added: T21: Fix the owner-prompt import, the installer .gitignore lock pattern, and both Math.max spreads
- 2026-09-27T19:57:59.496Z - task-added: T22: Run scripts/soak.ts automatically in a GitHub workflow with a bounded budget
- 2026-09-27T19:57:59.890Z - task-added: T23: Full gate: lint, typecheck, whole suite, wrap tripwire still failing-by-design
- 2026-09-27T19:58:00.287Z - task-added: T24: review-orchestrator over the accumulated diff
- 2026-09-27T19:58:00.685Z - task-added: T25: CHANGELOG, retire improvement-backlog, commit the audit report
- 2026-09-27T19:59:10.898Z - frozen: 19 criteria; checksum recorded
- 2026-09-27T19:59:11.058Z - started
- 2026-09-27T19:59:18.150Z - task-done: T1: Collect remaining context
- 2026-09-27T19:59:18.303Z - task-done: T2: Implement per plan
- 2026-09-27T19:59:18.465Z - task-done: T3: Add/adjust tests and make them pass
- 2026-09-27T19:59:18.623Z - task-done: T4: Self-review and prepare draft PR
- 2026-09-27T19:59:36.948Z - task-attempt: T5: started (attempt 1) — 008-T5 first dispatch
- 2026-09-27T20:08:26.083Z - task-done: T5: Failing tests for the five P0 defects: lease ratchet, seq ceiling, lock deadline, owner-queue leak, shutdown exit
- 2026-09-27T20:08:26.236Z - ac-updated: AC5: "`messageLineSchema` carries an upper bound on `seq`, a line above that bound is refused at read, and `nextSeq` refuses to build on an out-of-range recorded value; a test that appends a crafted line fails if the room is unwritable afterwards." -> "`messageLineSchema` bounds `seq` on the WRITE path so roomyx itself cannot produce an out-of-range line, reading stays permissive so a hand-crafted line cannot make an existing log unreadable, and `nextSeq` ignores an out-of-range recorded value when allocating rather than building on it; a test that appends a crafted line at the safe-integer ceiling fails if the room is unwritable afterwards, and a companion test fails if that line stops the log being read." (As frozen, AC5 required a line above the bound to be 'refused at read'. The T5 author showed that turns an unwritable room into an unreadable one — the worse failure for an append-only log with no repair command, and the exact class D-08 exists to prevent. The criterion described a fix that trades a recoverable fault for an unrecoverable one. Corrected to bound the write path and keep reads tolerant. No confirmations existed to void.)
- 2026-09-27T20:08:32.935Z - task-attempt: T6: started (attempt 1) — 008-T6 wave A parallel dispatch
- 2026-09-27T20:08:33.084Z - task-attempt: T7: started (attempt 1) — 008-T7 wave A parallel dispatch
- 2026-09-27T20:08:33.232Z - task-attempt: T8: started (attempt 1) — 008-T8 wave A parallel dispatch
- 2026-09-27T20:08:33.384Z - task-attempt: T9: started (attempt 1) — 008-T9 wave A parallel dispatch
- 2026-09-27T20:08:33.537Z - task-attempt: T10: started (attempt 1) — 008-T10 wave A parallel dispatch
- 2026-09-27T20:11:14.236Z - task-done: T8: Make the lock wait deadline reach its own stale reclaim
- 2026-09-27T20:11:26.572Z - task-done: T9: Settle the owner-queue entry when the handler throws
- 2026-09-27T20:12:13.351Z - task-done: T10: Always exit on shutdown; exit non-zero when close() rejected
- 2026-09-27T20:14:09.329Z - task-done: T7: Bound seq in messageLineSchema and make nextSeq refuse an out-of-range recorded seq
- 2026-09-27T20:27:39.392Z - task-done: T6: Stop a one-shot append holding a writer lease; consult isPidAlive; keep takenOverFrom; split stale from displaced
- 2026-09-27T20:27:45.677Z - task-attempt: T11: started (attempt 1) — orchestrator-run verification of wave A

## Wave A complete — 2026-09-27

`bun run check`: eslint clean, `tsc --noEmit` clean, **466 pass / 5 skip / 0
fail**, 2224 assertions, 28.9 s across 62 files. Baseline at flow start was
457 pass / 5 skip / 0 fail across 58 files — nine new tests, none weakened,
none deleted.

All five P0 defects flipped from failing to passing, each recorded with the
failure it produced before its fix:

| AC | Failed before with | Fixed by |
|---|---|---|
| AC1 | `A writer is live in … — pid 1545063` (an exited pid) | T6 |
| AC5 | `seq: Too big: expected int to be <=9007199254740991` on every later append | T7 |
| AC6 | `Timed out waiting for the lock` after 5002 ms on a 23 s-old lock | T8 |
| AC7 | three throwing handlers left three entries pending | T9 |
| AC8 | `registry is read-only` thrown inside `.finally()`, `exited` undefined | T10 |

The two unhandled-rejection blocks the T5 author saw are gone. Three
intentional stderr lines remain and are now commented as expected.

### AC5 was corrected mid-flow

As frozen it required an out-of-range line to be "refused at read". The T5
author showed that converts an unwritable room into an unreadable one — the
worse failure for an append-only log with no repair command, and the class D-08
exists to prevent. Corrected through `keryx flow ac update` with the reason
recorded: bound the write path, keep reads permissive, have `nextSeq` ignore
what it cannot build on. The test file keeps a deliberately-passing case
asserting the ceiling value is still accepted on read, so a later "fix" by low
schema ceiling is caught.

### Decisions taken by implementers, recorded rather than buried

- **T6 chose a tombstone over release-on-exit.** An unlinked lease file is
  ambiguous — absent cannot distinguish "never taken" from "deliberately
  displaced" — and the displaced server's heartbeat needs that distinction for
  AC4. The tombstone still replaces the token, which is the flow-003 defect it
  exists to prevent.
- **T8 computes the lock deadline once**, from the age of the first lock
  observed, not per iteration. A lock changing hands mid-wait would push a
  re-derived deadline out every time: a hang, not a fix.
- **T9 chose ack-and-rethrow** over settling with a reason. Freeing the slot
  silently would be the same defect in a new costume — the operator who posted
  the veto would never learn it failed. It also reworded `OwnerQueueFullError`,
  which asserted "Nothing is reading the queue" — false for the embedded-handler
  consumer, which settles through the callback and never polls.
- **T10 declined the audit's recommendation** to stop deregistering the room
  when `close()` rejects, citing a pre-existing test that pins the opposite
  order and the rationale already in `cli.ts` that "told to stop" is reason
  enough. The audit had bundled a behaviour change with a genuine exit-code
  defect; the defect is fixed and the decision left alone.

### Concerns carried forward from T6 (returned DONE, not silently dropped)

1. **`isLeaseHolderAlive` is a second copy** of `registry.ts:255`'s `isPidAlive`,
   written rather than imported because `registry.ts` was outside T6's allocated
   files and four siblings shared the checkout. Importing would add a
   root → `installer/` dependency edge, which the audit's structural item 17
   wants removed. Left for T24 (review) to rule on.
2. **A deliberate asymmetry**: a *fresh* lease with a dead holder is written to
   freely, while the *same lease 30 s later* is stale and demands `--take-over`.
   Each rule is defensible alone; together they read oddly. roomyx no longer
   produces fresh-dead leases, so this reaches only leases from 0.12.2 or a
   crashed embedder.
3. **`serve` now closes itself on displacement** — a behaviour change for
   embedders that pass `writerLeasePath` (`roomyx serve` never does, so no CLI
   impact). Verified by hand, covered by no test. Filed as its own task rather
   than accepted on a hand-run.

### Out of scope, unchanged, and not implied otherwise

The `canWrite(...)` structural fix stays out (`description.md`). `cli.ts` still
owns the single-writer decision, and nothing in the code comments suggests
otherwise.
- 2026-09-27T20:28:42.380Z - task-added: T26: Cover serve's self-close on writer-lease displacement with a test
- 2026-09-27T20:28:42.526Z - task-done: T11: Verify wave A: the five new tests fail before and pass after, suite green
- 2026-09-27T23:46:29.888Z - task-attempt: T12: started (attempt 1) — 008-T12 wave B tests
- 2026-09-28T00:02:27.761Z - task-done: T12: Failing tests for wave B: symlink backup, MCP config shape, limit 0, unauthenticated initialize
- 2026-09-28T00:02:33.086Z - task-attempt: T13: started (attempt 1) — 008-T13 wave B parallel
- 2026-09-28T00:02:33.427Z - task-attempt: T14: started (attempt 1) — 008-T14 wave B parallel
- 2026-09-28T00:05:04.615Z - task-done: T14: Validate the MCP config shape before rewriting it, and write temp-then-rename; reject limit 0
- 2026-09-28T00:07:27.363Z - task-done: T13: Refuse a symlinked target or .bak path in skill-sync
- 2026-09-28T00:07:27.513Z - task-attempt: T15: started (attempt 1) — 008-T15 per-room token
- 2026-09-28T00:56:44.787Z - task-done: T15: Mint a per-room token at serve(), require it on the transport, send it from all four in-tree clients

## T15 — the per-room token, and what it does not do

Landed at 481 pass / 5 skip / 0 fail, lint and typecheck clean, plus a
hand-driven round trip through real processes: `serve --port 0` → registry
entry carries the token and stdout prints neither → `rooms list` reports the
room **live** (the probe's own path, whose failure mode is a silent `unknown`)
→ `room commands` and `room delta` answer → `roomyx client` in a pty reached
`[connected]` with the roster rendered. The audit's own `curl` now returns 401,
naming the header and where the token lives and quoting neither value.

### A hole found beyond the brief and fixed

`roomyx.rooms.list` on the **unauthenticated** management server serialised
whole registry entries. It would therefore have handed every room's token to
exactly the caller the token exists to bound — the uncredentialled loopback
`curl` the audit used. Nobody would have had to ask for it. Now an explicit
field allow-list, pinned by a test, written so a field added later does not
appear by default.

The general lesson is worth more than the fix: **any future field on
`RoomRegistryEntry` is one `listLiveRooms` call away from that port.**

### Three concerns carried, and what happens to each

1. **The registry file mode bounds how far the token reaches.**
   `writeRegistryUnlocked` uses `writeFileSync`'s default, typically `0644`. So
   the token stops a caller that knows only the port, and stops a browser page
   outright — but it does **not** stop a same-user local process that can read
   the registry. This is a real improvement on the audit's finding and it is
   weaker than "authentication". **D-06b must say so plainly**, in D-06a's
   shape, or the token will be read as more than it is. Tightening the registry
   to `0600` is a one-line change that deserves its own decision rather than a
   silent ride-along — filed as T27.
2. **A `serve` restart now permanently strands an attached TUI.** A new process
   mints a new token; `RoomClient` holds the one it was built with and retries
   against 401 forever instead of reconnecting. Judged correct — a restarted
   room is a different room with a different id and entry, and silently
   accepting a stale credential is the property that must not hold — but an
   operator can hit it and the client says only `disconnected`. The friendlier
   fix is for `RoomClient` to re-resolve from the registry on reconnect, not to
   relax the gate. Filed as T28.
3. **The management server stays unauthenticated, deliberately.** No
   owner-command queue, its two tools report rather than act, D-11 already
   removed the `yes` that made `skills.sync` dangerous, and it is the surface
   documented for Claude Code / Codex / keryx to attach to, where a credential
   has nowhere to come from. What it does need is the allow-listing discipline
   above applied as a rule rather than as one fix.

### Contract change, stated

`serve.test.ts` previously connected with no credential and was named for that
working. It now presents the token and carries a docstring saying
`room-token.test.ts` asserts its negation, that the two are not in conflict,
and what changed. This is a breaking change to the wire contract for any
external client, which is the D-13 version question for T25.
- 2026-09-28T00:56:44.945Z - task-added: T27: Tighten the room registry file mode, with its own decision record
- 2026-09-28T00:56:45.091Z - task-added: T28: RoomClient re-resolves the token from the registry on reconnect
- 2026-09-28T04:07:22.768Z - task-attempt: T16: started (attempt 1) — orchestrator writes D-06b and SECURITY.md
- 2026-09-28T04:08:22.863Z - task-done: T16: Write D-06b and SECURITY.md
- 2026-09-28T04:08:36.131Z - task-attempt: T17: started (attempt 1) — orchestrator-run independent round trip
- 2026-09-28T04:10:19.156Z - task-added: T29: MCP servers and clients announce version 0.1.0 while the package is 0.12.2

## T17 — wave B verified independently, by the orchestrator

Run against the working tree (`bun src/cli.ts`), not the installed 0.12.2, with
real processes and real ports. The implementer does not self-accept, so this
repeats T15's hand-run rather than trusting it.

| Check | Result |
|---|---|
| `serve --port 0` stdout | prints the URL and the room id, **and neither the token nor any part of it** |
| registry entry | carries `"token": "e63d…bfe2"`, 32 hex characters |
| `rooms list` | reports the room — this is the liveness probe's own path, whose failure mode is a silent `unknown`, not a red test |
| unauthenticated `initialize` (raw curl) | **401**, body names the header and where the token lives, and quotes neither the expected nor the presented value |
| syntactically valid wrong token | **401** |
| the real token | **200**, `serverInfo` returned |
| anonymous `roomyx.rooms.list` on the management server | returns `id`, `port`, `logPath`, `pid`, `startedAt` — **no token**; grep for the token's value in the response: 0 matches |
| SIGTERM | registry back to `rooms: []`, deregistered cleanly |

The audit's own reproduction — plain `curl`, no credential, reading the
transcript and queueing an owner command — is closed.

### Two things this run found that no reviewer did

1. **The registry file mode is `664`**, measured. This is exactly the limit T15
   flagged and D-06b now documents: the token stops a caller who knows only the
   port, and a browser outright, and does **not** stop a same-user process that
   can read the registry. Confirmed rather than assumed. T27 owns tightening it.
2. **Every MCP server and client announces `version: "0.1.0"`** while the
   package is `0.12.2` — `server/index.ts:77`, `mcp-management/server.ts:39`,
   `installer/registry.ts:318`, `installer/room-tool.ts:33`,
   `client/mcp-client.ts:161`. An MCP host that logs `serverInfo.version` has
   been recording a version this package has not been since its first release.
   Filed as T29. Nine reviewers missed it; a round trip found it in one call.
- 2026-09-28T04:10:19.604Z - task-done: T17: Verify wave B: a real serve + client + liveness-probe round trip, not only unit tests
