# Tasks

Task definitions live here; task **statuses** live in flow.json and are managed
only via `keryx flow task done <id> <taskId>`.

The four `origin: "scaffold"` rows exist from `flow init`; a row the plan
supersedes is closed with `--disposition skipped --reason "<why>"`.

| ID | Kind | Title |
|----|------|-------|
| T1 | context | Collect remaining context (done inline: R7's rule, the three call sites, the four existing tests) |
| T2 | test | Red tests first: live-pid/no-listener is not pruned and not archived; identity mismatch still is; three-valued check |
| T3 | implement | `Liveness` + `checkRoomLiveness`; prune `gone` only; unconfirmed as a separate channel |
| T4 | review | `code-verifier` + `review-orchestrator` on the branch; fix findings |
| T5 | test | End-to-end: run `rooms list` against a registry holding a confirmed-live room, an unconfirmed one and a gone one |
| T6 | docs | CHANGELOG + version per D-13; state the pid-reuse limit in the code comment |
