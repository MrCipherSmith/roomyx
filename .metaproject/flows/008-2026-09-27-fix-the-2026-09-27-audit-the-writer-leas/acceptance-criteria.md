# Acceptance Criteria

Rules:

- Criteria lines use the exact format `- ACn: <criterion>`.
- After `flow freeze` this file is checksum-protected: any edit outside
  `keryx flow ac update` fails every gate and status transition.
- Completion requires every ACn to be confirmed via
  `keryx flow ac confirm <id> <ACn>`.

Every criterion below names a test that must FAIL on the pre-fix code. Each of
these defects was reproduced during the audit, so a test that does not fail
first is not evidence and does not satisfy its criterion.

## Criteria

- AC1: After `roomyx room append <log> --take-over`, a subsequent plain `roomyx room append <log>` exits 0 — no 30-second refusal window, no `pass --take-over` demand, no spurious `owner`/`status` line beyond the one the take-over itself records — and a test driving append → `--take-over` → append fails if the third call is refused.
- AC2: `writerPresent` consults `isPidAlive` before refusing, so a lease naming a pid that no longer exists does not block an append, and a test writing a lease for an unused pid fails if the append is refused.
- AC3: `parseLease` round-trips `takenOverFrom` rather than narrowing it away, so take-over provenance is still readable after `refreshWriterLease` has run, and a test fails if a heartbeat erases it.
- AC4: `serve`'s heartbeat failure path distinguishes "the lease went stale, re-acquire" from "the token now belongs to someone else", so a stall does not report a take-over that did not happen and does not permanently clear the heartbeat, and a test fails if the two cases are indistinguishable.
- AC5: `messageLineSchema` bounds `seq` on the WRITE path so roomyx itself cannot produce an out-of-range line, reading stays permissive so a hand-crafted line cannot make an existing log unreadable, and `nextSeq` ignores an out-of-range recorded value when allocating rather than building on it; a test that appends a crafted line at the safe-integer ceiling fails if the room is unwritable afterwards, and a companion test fails if that line stops the log being read.
- AC6: A process waiting on a lock whose holder was killed acquires that lock rather than timing out, and a test planting a lock file with an old mtime fails if `withLock` throws a timeout instead of proceeding.
- AC7: `room.post_owner_command` settles the queue entry whether the handler resolves or throws, and a test driving several throwing handlers fails if the pending count is not zero.
- AC8: A `cleanup()` that throws does not prevent `exit()`, and a `close()` that rejects produces a non-zero exit code, on both the server and client shutdown paths; a test fails if the process neither exits nor exits non-zero as specified.
- AC9: `syncSkill` refuses by name when the target or its `.bak` path is a symlink rather than following it, and a test planting a symlink at the `.bak` path fails if the victim file is modified.
- AC10: The room MCP endpoint requires a per-room token minted at `serve()` and stored in the registry entry; an `initialize` without it is refused, every in-tree client (`RoomClient`, `callRoomTool`, `probeRoomState`, the liveness probe) still works end to end, and decision record D-06b states what the token does and does not cover.
- AC11: `ensureMcpServer` refuses a parsed value that is not a plain object — an array or `null` included — with the same "left untouched" wording it already uses for unparseable JSON, writes temp-then-rename, and tests over `[1,2]`, `null` and `{"mcpServers":"notanobject"}` fail if the operator's file is rewritten.
- AC12: The `room.get_transcript` input schema requires `limit >= 1`, so the documented `next_seq` → `since_seq` cursor loop cannot spin without progress, and a test fails if `limit: 0` is accepted.
- AC13: `loadRoomLog` returns a cached parse while the file's `(mtimeMs, size)` is unchanged and re-reads when it changes, `nextSeq` does not parse the whole log, `foldEdits` skips its sort when no edit-kind message is present, and a test fails on either half of the invalidation; a before/after measurement is recorded in `journal.md`.
- AC14: `src/client/owner-prompt.ts` no longer imports from `../server/index`, recorded as a measured `bun build` byte count before and after.
- AC15: `git check-ignore` reports a room-log lockfile under `.roomyx/rooms/logs/` as ignored in a freshly initialised project, not only the registry lock.
- AC16: `scripts/soak.ts` is invoked by a GitHub workflow with a bounded budget, and a failure there fails the job.
- AC17: `SECURITY.md` at the repository root names a private disclosure path and states the tool's write footprint into agent configuration directories.
- AC18: `bun run lint`, `bun run typecheck` and `bun test` all pass on the final state with no test weakened or deleted, and the `test.failing` wrap tripwire is still present and still failing-by-design.
- AC19: `CHANGELOG.md` carries the release entry under the version D-13 requires, `docs/roomyx/decisions.md` carries D-06b, `docs/roomyx/improvement-backlog.md` is retired with a pointer to what replaced it, `docs/roomyx/audit-2026-09-27.md` is committed, and `ACTIONS.md`'s D-18 triage table no longer omits item 7.
