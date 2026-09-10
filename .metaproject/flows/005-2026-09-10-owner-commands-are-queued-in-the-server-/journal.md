# Flow Journal

- 2026-09-10T12:47:05.420Z - flow created
- 2026-09-10T12:47:48.789Z - task-added: T5: The TUI renders the owner-command status, with queued as a state rather than a failure
- 2026-09-10T12:47:48.920Z - task-added: T6: End to end: two real MCP sessions against a live serve(), plus the resource read
- 2026-09-10T12:47:49.049Z - task-added: T7: CHANGELOG and minor version per D-13; state the bound and the settling rules
- 2026-09-10T12:47:49.190Z - frozen: 8 criteria; checksum recorded
- 2026-09-10T12:47:49.340Z - started
- 2026-09-10T12:47:49.446Z - task-done: T1: Collect remaining context
- 2026-09-10T12:56:57.150Z - ac-confirmed: AC1: test/server/owner-queue.test.ts (11 cases): cross-session post/read, queued-vs-refused, resource parity, ack refusal, handler settling, bound, log untouched; 398 pass / 0 fail; mutations recorded in the review package
- 2026-09-10T12:56:57.261Z - ac-confirmed: AC2: test/server/owner-queue.test.ts (11 cases): cross-session post/read, queued-vs-refused, resource parity, ack refusal, handler settling, bound, log untouched; 398 pass / 0 fail; mutations recorded in the review package
- 2026-09-10T12:56:57.361Z - ac-confirmed: AC3: test/server/owner-queue.test.ts (11 cases): cross-session post/read, queued-vs-refused, resource parity, ack refusal, handler settling, bound, log untouched; 398 pass / 0 fail; mutations recorded in the review package
- 2026-09-10T12:56:57.453Z - ac-confirmed: AC4: test/server/owner-queue.test.ts (11 cases): cross-session post/read, queued-vs-refused, resource parity, ack refusal, handler settling, bound, log untouched; 398 pass / 0 fail; mutations recorded in the review package
- 2026-09-10T12:56:57.553Z - ac-confirmed: AC5: test/server/owner-queue.test.ts (11 cases): cross-session post/read, queued-vs-refused, resource parity, ack refusal, handler settling, bound, log untouched; 398 pass / 0 fail; mutations recorded in the review package
- 2026-09-10T12:56:57.641Z - ac-confirmed: AC6: test/server/owner-queue.test.ts (11 cases): cross-session post/read, queued-vs-refused, resource parity, ack refusal, handler settling, bound, log untouched; 398 pass / 0 fail; mutations recorded in the review package
- 2026-09-10T12:56:57.732Z - ac-confirmed: AC7: test/server/owner-queue.test.ts (11 cases): cross-session post/read, queued-vs-refused, resource parity, ack refusal, handler settling, bound, log untouched; 398 pass / 0 fail; mutations recorded in the review package
- 2026-09-10T12:56:57.821Z - ac-confirmed: AC8: test/server/owner-queue.test.ts (11 cases): cross-session post/read, queued-vs-refused, resource parity, ack refusal, handler settling, bound, log untouched; 398 pass / 0 fail; mutations recorded in the review package
- 2026-09-10T12:56:57.911Z - task-done: T2: Implement per plan
- 2026-09-10T12:56:58.018Z - task-done: T3: Add/adjust tests and make them pass
- 2026-09-10T12:56:58.117Z - task-done: T4: Self-review and prepare draft PR
- 2026-09-10T12:56:58.215Z - task-done: T5: The TUI renders the owner-command status, with queued as a state rather than a failure
- 2026-09-10T12:56:58.314Z - task-done: T6: End to end: two real MCP sessions against a live serve(), plus the resource read
- 2026-09-10T12:56:58.411Z - task-done: T7: CHANGELOG and minor version per D-13; state the bound and the settling rules
- 2026-09-10T12:57:01.773Z - implemented: draft PR: https://github.com/MrCipherSmith/roomyx/pull/10 (warning: PR is not a draft)
- 2026-09-10T12:57:01.876Z - completing
- 2026-09-10T12:57:07.306Z - completion-failed: review: 1 of 5 conditions failed — external-comments (unobserved): the external-comment collection did not run: nothing records whether anyone commented on MrCipherSmith/roomyx#10 (`.metaproject/reviews/pr-comments/MrCipherSmith__roomyx__10.json` does not exist). Zero collected comments and no collection at all are different facts, and only one of them is clean. Run `keryx review comments collect --repo MrCipherSmith/roomyx --pr 10 --sha <pr-head>`, or inject `FlowServiceDeps.externalCommentsGate` with a collector of your own.
- 2026-09-10T12:57:17.598Z - implemented: draft PR: https://github.com/MrCipherSmith/roomyx/pull/10 (warning: PR is not a draft)
- 2026-09-10T12:57:17.708Z - completing
- 2026-09-10T12:57:23.149Z - done: all gates passed

## Completion — 2026-09-10

Closed via **outcome A: PR merged into `main`, then released.**

- PR: https://github.com/MrCipherSmith/roomyx/pull/10 — squashed as `a59e5e4`, CI green.
- Release: tag `v0.10.0` → published `@mrciphersmith/roomyx@0.10.0` with provenance.
  Confirmed by reading the registry back.
- 8/8 acceptance criteria confirmed; all five gates hold; 398 tests pass.

### The design detail that decided the flow

`serveMcpOverHttp` calls `createMcpServer()` **once per session**, so a queue
inside `createRoomMcpServer` would belong to one client and the dispatcher's own
session could not read it. The queue is created in `serve()` and injected. The
test posts from one session and reads from another, and mutation 1 — creating the
queue per session — fails exactly that test. Without this the flow would have
shipped a feature that passed every single-client test and did nothing in the
shape it exists for.

### Two decisions taken while implementing, not in the plan

- **The queue is bounded at 32**, refusing with a message that names the backlog.
  The server lives as long as the room; an unbounded queue is the same class of
  defect as the session retention R5 fixed.
- **A handler that answers settles the entry**, so the two roads cannot deliver
  one veto twice.

### The review found a real defect, in this branch's own code

`owner-queue.ts` imported the vocabulary from `index.ts` while `index.ts`
imported the queue from `owner-queue.ts` — a cycle, plus a dead re-export. It
worked under this loader only because the bindings are read inside functions.
Fixed by moving the vocabulary to `owner-queue.ts` and re-exporting from
`index.ts`; one direction of dependency instead of two.

### Process, and a repeat of a recorded mistake

**I re-ran the `git checkout --` trap recorded after flow 004.** Reverting a
mutation reverted the *uncommitted* implementation with it, and `index.ts` and
`serve.ts` had to be reapplied. The lesson was already written down and I hit it
anyway, which is the argument for the ordering rather than the note: **commit,
then mutate, then `git checkout`**. The second run of the three mutations was
done against a commit, and its reverts left the tree clean.

Also recorded: `gh auth switch` reports success while operations still run as the
other account, so `gh auth token --user MrCipherSmith` and an explicit
`GH_TOKEN`/`x-access-token` URL is the route that works for merges, pushes and
tags.
