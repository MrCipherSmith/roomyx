# Tasks

Task definitions live here; task **statuses** live in flow.json and are managed
only via `keryx flow task done <id> <taskId>`.

These four were created by `keryx flow init` as a default checklist; T5 and T6
are added by the plan. A scaffold row a plan supersedes is closed with
`--disposition skipped --reason "<why>"`, not left open.

| ID | Kind | Title |
|----|------|-------|
| T1 | context | Collect remaining context (done inline: D-17, backlog section, in-scope files, existing tests) |
| T2 | test | Write the failing tests first: pointer names the author, survives a collapsed header, is searchable, matches export |
| T3 | implement | One reply-pointer formatter; tag drawn outside the collapsed header; haystack and export use it |
| T4 | review | `code-verifier` + `review-orchestrator` on the branch; fix findings through `task-implementer` |
| T5 | test | Prove pane, search and export agree on one real log (`docs/roomyx/screenshots/review-room.jsonl`) — the verification step, as a task |
| T6 | docs | CHANGELOG entry + `package.json` patch bump; confirm no surface/format change |
