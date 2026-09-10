# Flow Journal

- 2026-09-10T10:22:25.101Z - flow created
- 2026-09-10T10:23:00.254Z - task-added: T5: End-to-end verification: run the ownership table against a real bare serve and a real dispatcher-attached server
- 2026-09-10T10:23:00.410Z - task-added: T6: Structural writing: --json envelope, --body-file -, --many all-or-nothing batch
- 2026-09-10T10:23:00.555Z - task-added: T7: SKILL.md loses --force; CHANGELOG minor bump to 0.8.0; confirm the log format is unchanged
- 2026-09-10T10:23:00.707Z - frozen: 9 criteria; checksum recorded
- 2026-09-10T10:23:00.860Z - started
- 2026-09-10T10:23:48.294Z - task-done: T1: Collect remaining context
- 2026-09-10T10:23:48.478Z - task-attempt: T2: started (attempt 1) — 003-T2 tests-first, written in the orchestrator context (delegate sandbox has no write/shell tools — see flow 002)
- 2026-09-10T10:26:14.363Z - task-done: T2: Implement per plan
- 2026-09-10T10:26:14.615Z - task-done: T3: Add/adjust tests and make them pass
- 2026-09-10T10:26:14.870Z - task-done: T6: Structural writing: --json envelope, --body-file -, --many all-or-nothing batch
- 2026-09-10T10:29:21.088Z - task-done: T5: End-to-end verification: run the ownership table against a real bare serve and a real dispatcher-attached server
- 2026-09-10T10:29:21.260Z - task-done: T7: SKILL.md loses --force; CHANGELOG minor bump to 0.8.0; confirm the log format is unchanged
- 2026-09-10T10:32:08.016Z - task-attempt: T4: started (attempt 1) — 003-T4 review round 1: 4 major + 6 minor, all in the code this flow introduced
- 2026-09-10T11:47:53.528Z - ac-confirmed: AC1: test/writer-lease.test.ts, test/server/dispatcher-attached.test.ts, test/cli-room.test.ts, test/cli-room-ownership-e2e.test.ts; 358 pass / 0 fail on the merged tree; the two executed refutations are recorded in the review package
- 2026-09-10T11:47:53.617Z - ac-confirmed: AC2: test/writer-lease.test.ts, test/server/dispatcher-attached.test.ts, test/cli-room.test.ts, test/cli-room-ownership-e2e.test.ts; 358 pass / 0 fail on the merged tree; the two executed refutations are recorded in the review package
- 2026-09-10T11:47:53.703Z - ac-confirmed: AC3: test/writer-lease.test.ts, test/server/dispatcher-attached.test.ts, test/cli-room.test.ts, test/cli-room-ownership-e2e.test.ts; 358 pass / 0 fail on the merged tree; the two executed refutations are recorded in the review package
- 2026-09-10T11:47:53.787Z - ac-confirmed: AC4: test/writer-lease.test.ts, test/server/dispatcher-attached.test.ts, test/cli-room.test.ts, test/cli-room-ownership-e2e.test.ts; 358 pass / 0 fail on the merged tree; the two executed refutations are recorded in the review package
- 2026-09-10T11:47:53.868Z - ac-confirmed: AC5: test/writer-lease.test.ts, test/server/dispatcher-attached.test.ts, test/cli-room.test.ts, test/cli-room-ownership-e2e.test.ts; 358 pass / 0 fail on the merged tree; the two executed refutations are recorded in the review package
- 2026-09-10T11:47:53.956Z - ac-confirmed: AC6: test/writer-lease.test.ts, test/server/dispatcher-attached.test.ts, test/cli-room.test.ts, test/cli-room-ownership-e2e.test.ts; 358 pass / 0 fail on the merged tree; the two executed refutations are recorded in the review package
- 2026-09-10T11:47:54.041Z - ac-confirmed: AC7: test/writer-lease.test.ts, test/server/dispatcher-attached.test.ts, test/cli-room.test.ts, test/cli-room-ownership-e2e.test.ts; 358 pass / 0 fail on the merged tree; the two executed refutations are recorded in the review package
- 2026-09-10T11:47:54.125Z - ac-confirmed: AC8: test/writer-lease.test.ts, test/server/dispatcher-attached.test.ts, test/cli-room.test.ts, test/cli-room-ownership-e2e.test.ts; 358 pass / 0 fail on the merged tree; the two executed refutations are recorded in the review package
- 2026-09-10T11:47:54.210Z - ac-confirmed: AC9: test/writer-lease.test.ts, test/server/dispatcher-attached.test.ts, test/cli-room.test.ts, test/cli-room-ownership-e2e.test.ts; 358 pass / 0 fail on the merged tree; the two executed refutations are recorded in the review package
- 2026-09-10T11:47:56.797Z - implemented: draft PR: https://github.com/MrCipherSmith/roomyx/pull/6 (warning: PR is not a draft)
- 2026-09-10T11:49:06.892Z - completing
- 2026-09-10T11:49:11.788Z - completion-failed: tasks: not done: T4
- 2026-09-10T11:49:16.129Z - task-done: T4: Self-review and prepare draft PR
- 2026-09-10T11:49:18.570Z - implemented: draft PR: https://github.com/MrCipherSmith/roomyx/pull/6 (warning: PR is not a draft)
- 2026-09-10T11:49:18.659Z - completing
- 2026-09-10T11:49:23.823Z - done: all gates passed

## Completion — 2026-09-10

Flow closed via **outcome A: PR merged into the recorded base branch `main`, then
released.**

- PR: https://github.com/MrCipherSmith/roomyx/pull/6 — squashed into `main` as
  `55c673d`, CI green.
- Release: tag `v0.8.0` → verify, pack, smoke-test, publish with provenance, and
  the GitHub Release. Confirmed by reading the registry back
  (`@mrciphersmith/roomyx@0.8.0`), not by the run's exit code.
- All 9 acceptance criteria confirmed; all five gates hold.

### The review round found four real defects, all in this branch's own code

Recorded because the pattern matters more than the individual bugs: every one of
the four was a way for **two writers to append to one log** — the exact failure
the flow exists to prevent — and every one was introduced by the change itself.

1. The lease was keyed by the registry, so all rooms in a project shared one
   file. `room append` to room B was refused by room A's writer.
2. `--take-over` wrote no lease, so the displaced writer's heartbeat revived the
   lease it still held: two writers, produced by the act of taking over.
3. The lease was read only after the liveness probe succeeded, so a probe timeout
   on a busy machine meant "no writer" and the CLI wrote into a live room.
4. `dispatcherAttached` was produced and consumed nowhere, so the inference it
   was added to replace was still the only guard for any embedder that manages no
   lease file.

Two are proven and refuted by **executed mutation** (reintroducing the defect
fails the named test on the merged tree); the rest are `site-check` refutations,
labelled as the weaker evidence they are. The review report states its own
coverage gap: read-side D-18 items 5 and 6 were out of scope, `RoomState`
construction by an external embedder is not exercised, and Windows path
semantics for the lease directory were not verified.

### Self-inflicted defect worth remembering

A source file was written to disk containing `[REDACTED:ip]` as the loopback
host, because text passing through this project's tooling has IP literals
redacted — including text headed for a file. `new URL()` then threw at runtime
while the whole suite passed, since the tests build their URLs from the same
constant. Repaired, and the address is now assembled from its octets with the
reason written down. Detection that works: a written-to-disk check for the
marker, which is how it was found.

### Process snags, both recurring

- **T4 must be closed by hand.** In flow 002 and again here, `flow complete`
  refused on `tasks` because the review task was still open. The gate is right —
  nothing closes a scaffold row on a timer — but the orchestrator should close it
  as part of the review round rather than at the end.
- **`gh` reverts to the other account between calls**, so every push needs
  `gh auth switch --user MrCipherSmith` in the same command. Four failed pushes
  in this flow were all this, and the error (`Permission … denied to
  aleksandr-tsaitler`) names the account, not the cause.
