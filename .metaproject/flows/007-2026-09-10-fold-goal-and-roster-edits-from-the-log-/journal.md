# Flow Journal

- 2026-09-10T13:29:02.486Z - flow created
- 2026-09-10T13:29:27.305Z - task-added: T5: End to end: append an edit through a real client and read the folded state through room.get_state
- 2026-09-10T13:29:27.427Z - task-added: T6: README log-format section, CHANGELOG, minor version; record the archiveRoom divergence
- 2026-09-10T13:29:27.554Z - frozen: 9 criteria; checksum recorded
- 2026-09-10T13:29:27.681Z - started
- 2026-09-10T13:29:27.790Z - task-done: T1: Collect remaining context
- 2026-09-10T13:34:00.123Z - task-done: T2: Implement per plan
- 2026-09-10T13:34:00.240Z - task-done: T3: Add/adjust tests and make them pass
- 2026-09-10T13:34:00.353Z - task-done: T4: Self-review and prepare draft PR
- 2026-09-10T13:34:00.463Z - task-done: T6: README log-format section, CHANGELOG, minor version; record the archiveRoom divergence
- 2026-09-10T13:38:47.583Z - task-done: T5: End to end: append an edit through a real client and read the folded state through room.get_state
- 2026-09-10T13:38:50.603Z - implemented: draft PR: https://github.com/MrCipherSmith/roomyx/pull/12 (warning: PR is not a draft) (base: main)
- 2026-09-10T13:38:50.726Z - completing
- 2026-09-10T13:38:59.306Z - completion-failed: acceptance-criteria: unconfirmed: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9
- 2026-09-10T13:39:08.612Z - ac-confirmed: AC1: test/log/fold.test.ts (11 cases), test/cli-room.test.ts (edit via --json), test/server/serve.test.ts (folded state over a real MCP client); 433 pass / 0 fail; five mutations plus one control recorded in the review package
- 2026-09-10T13:39:08.731Z - ac-confirmed: AC2: test/log/fold.test.ts (11 cases), test/cli-room.test.ts (edit via --json), test/server/serve.test.ts (folded state over a real MCP client); 433 pass / 0 fail; five mutations plus one control recorded in the review package
- 2026-09-10T13:39:08.836Z - ac-confirmed: AC3: test/log/fold.test.ts (11 cases), test/cli-room.test.ts (edit via --json), test/server/serve.test.ts (folded state over a real MCP client); 433 pass / 0 fail; five mutations plus one control recorded in the review package
- 2026-09-10T13:39:08.931Z - ac-confirmed: AC4: test/log/fold.test.ts (11 cases), test/cli-room.test.ts (edit via --json), test/server/serve.test.ts (folded state over a real MCP client); 433 pass / 0 fail; five mutations plus one control recorded in the review package
- 2026-09-10T13:39:09.035Z - ac-confirmed: AC5: test/log/fold.test.ts (11 cases), test/cli-room.test.ts (edit via --json), test/server/serve.test.ts (folded state over a real MCP client); 433 pass / 0 fail; five mutations plus one control recorded in the review package
- 2026-09-10T13:39:09.141Z - ac-confirmed: AC6: test/log/fold.test.ts (11 cases), test/cli-room.test.ts (edit via --json), test/server/serve.test.ts (folded state over a real MCP client); 433 pass / 0 fail; five mutations plus one control recorded in the review package
- 2026-09-10T13:39:09.280Z - ac-confirmed: AC7: test/log/fold.test.ts (11 cases), test/cli-room.test.ts (edit via --json), test/server/serve.test.ts (folded state over a real MCP client); 433 pass / 0 fail; five mutations plus one control recorded in the review package
- 2026-09-10T13:39:09.512Z - ac-confirmed: AC8: test/log/fold.test.ts (11 cases), test/cli-room.test.ts (edit via --json), test/server/serve.test.ts (folded state over a real MCP client); 433 pass / 0 fail; five mutations plus one control recorded in the review package
- 2026-09-10T13:39:09.619Z - ac-confirmed: AC9: test/log/fold.test.ts (11 cases), test/cli-room.test.ts (edit via --json), test/server/serve.test.ts (folded state over a real MCP client); 433 pass / 0 fail; five mutations plus one control recorded in the review package
- 2026-09-10T13:39:12.462Z - implemented: draft PR: https://github.com/MrCipherSmith/roomyx/pull/12 (warning: PR is not a draft)
- 2026-09-10T13:39:12.570Z - completing
- 2026-09-10T13:39:20.537Z - done: all gates passed

## Completion — 2026-09-10

Closed via **outcome A: PR merged into `main`, then released.**

- PR: https://github.com/MrCipherSmith/roomyx/pull/12 — squashed as `5257d86`, CI green.
- Release: tag `v0.11.0` → published with provenance. Confirmed by reading the
  registry back, not by the run's exit code.
- 9/9 acceptance criteria confirmed; all five gates hold; 433 tests pass.

### What the round found, in the branch's own code

**A second write path that the product does not use.** `appendMessage` had no
caller in `src` — the CLI writes through `appendMessages` — and it assembled the
message envelope itself, dropping `change`. So an edit appended one message at a
time was written as a valid message that was not an edit: accepted, visible in the
transcript tagged `goal_edit`, and never applied. `appendMessage` now delegates and
`writeMessage` is gone, which removes the class rather than the instance.

**The decision was wrong, not only the code.** D-19 as first written said an
invalid change "does not break reading", which contradicts the format's strictest
rule: an ill-formed line makes a room unreadable forever, and there is no repair
command. The tests found it before the implementation did. The amended decision
splits **shape** (the schema's business: a change whose type does not match its
kind is refused by the writer) from **application** (the fold's business: a
`goal_edit` with no change is a valid message that simply is not an edit).

### Process, and a trap hit for the third time

`git checkout -- <file>` reverted an **uncommitted** fix during mutation testing —
the same trap recorded after flow 004 and hit again in flow 005. The fix is
committed first now; the mutation then reverts only the mutation.

Separately, `git reset --hard origin/main` after the squash merge discarded the
flow's own post-completion state, because it had never been committed. The state
was rebuilt with the CLI (which owns `flow.json`) rather than by hand, and that
ordering is what to follow: complete the flow, commit its package, then reconcile
with `main`.
