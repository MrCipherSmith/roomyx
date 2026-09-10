# Flow Journal

- 2026-09-10T13:00:15.965Z - flow created
- 2026-09-10T13:00:49.705Z - task-added: T5: End to end over a real MCP client: each fixture participant's delta, and the description as a client receives it
- 2026-09-10T13:00:50.072Z - task-added: T6: CHANGELOG and version per D-13; the tool description must not overclaim delivery
- 2026-09-10T13:00:50.396Z - frozen: 8 criteria; checksum recorded
- 2026-09-10T13:00:50.748Z - started
- 2026-09-10T13:00:51.136Z - task-done: T1: Collect remaining context
- 2026-09-10T13:08:30.977Z - ac-confirmed: AC1: test/server/tools.test.ts (8 delta cases) + test/server/serve.test.ts (wire: per-participant deltas and the description as a client reads it); 407 pass / 0 fail; four executed mutations in the review package
- 2026-09-10T13:08:31.241Z - ac-confirmed: AC2: test/server/tools.test.ts (8 delta cases) + test/server/serve.test.ts (wire: per-participant deltas and the description as a client reads it); 407 pass / 0 fail; four executed mutations in the review package
- 2026-09-10T13:08:31.778Z - ac-confirmed: AC3: test/server/tools.test.ts (8 delta cases) + test/server/serve.test.ts (wire: per-participant deltas and the description as a client reads it); 407 pass / 0 fail; four executed mutations in the review package
- 2026-09-10T13:08:32.269Z - ac-confirmed: AC4: test/server/tools.test.ts (8 delta cases) + test/server/serve.test.ts (wire: per-participant deltas and the description as a client reads it); 407 pass / 0 fail; four executed mutations in the review package
- 2026-09-10T13:08:32.650Z - ac-confirmed: AC5: test/server/tools.test.ts (8 delta cases) + test/server/serve.test.ts (wire: per-participant deltas and the description as a client reads it); 407 pass / 0 fail; four executed mutations in the review package
- 2026-09-10T13:08:32.996Z - ac-confirmed: AC6: test/server/tools.test.ts (8 delta cases) + test/server/serve.test.ts (wire: per-participant deltas and the description as a client reads it); 407 pass / 0 fail; four executed mutations in the review package
- 2026-09-10T13:08:33.340Z - ac-confirmed: AC7: test/server/tools.test.ts (8 delta cases) + test/server/serve.test.ts (wire: per-participant deltas and the description as a client reads it); 407 pass / 0 fail; four executed mutations in the review package
- 2026-09-10T13:08:33.682Z - ac-confirmed: AC8: test/server/tools.test.ts (8 delta cases) + test/server/serve.test.ts (wire: per-participant deltas and the description as a client reads it); 407 pass / 0 fail; four executed mutations in the review package
- 2026-09-10T13:08:33.939Z - task-done: T2: Implement per plan
- 2026-09-10T13:08:34.190Z - task-done: T3: Add/adjust tests and make them pass
- 2026-09-10T13:08:34.425Z - task-done: T4: Self-review and prepare draft PR
- 2026-09-10T13:08:34.626Z - task-done: T5: End to end over a real MCP client: each fixture participant's delta, and the description as a client receives it
- 2026-09-10T13:08:34.829Z - task-done: T6: CHANGELOG and version per D-13; the tool description must not overclaim delivery
- 2026-09-10T13:08:38.565Z - implemented: draft PR: https://github.com/MrCipherSmith/roomyx/pull/11 (warning: PR is not a draft) (base: main)
- 2026-09-10T13:08:38.738Z - completing
- 2026-09-10T13:08:48.352Z - completion-failed: pull-request: PR checks not green
- 2026-09-10T13:21:34.056Z - implemented: draft PR: https://github.com/MrCipherSmith/roomyx/pull/11 (warning: PR is not a draft)
- 2026-09-10T13:21:34.191Z - completing
- 2026-09-10T13:21:42.051Z - done: all gates passed

## Post-merge note — the branch collided with main twice

While this branch was open, the repository owner shipped **two** releases to
`main`: "Ship the persona library" (0.10.1) and "Offer the persona library at
both scopes" (0.10.2). This branch had used **both** numbers, because it took the
next free patch each time it was renumbered and `main` moved again in between.

The rule applied both times, and it is the only defensible one: **their releases
are published and mine was not, so mine moved.** `package.json` was taken from
`main` with the version bumped to 0.10.3, and their CHANGELOG text was kept
verbatim with this branch's entry inserted above. Nothing of theirs was
rewritten, renumbered or dropped — verified by grep for both entries.

The four executed mutations were re-run against the merged head (`0aff0aa`) and
still fail their named tests, so the evidence in the review package names the
tree that actually merged rather than the one the round was first run on.

**Worth deciding before the next flow:** `main` is moving faster than a flow
takes to complete, and every collision costs a rebase plus a version renumber.
The alternatives are to hold `main` while a flow is in flight, or to accept the
renumbering as routine — but it should be a decision rather than something that
happens each time.
