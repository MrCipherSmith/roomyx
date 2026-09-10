# Tasks

Task definitions live here; task **statuses** live in flow.json and are managed
only via `keryx flow task done <id> <taskId>`.

The four `origin: "scaffold"` rows exist from `flow init`; a row the plan
supersedes is closed with `--disposition skipped --reason "<why>"`.

| ID | Kind | Title |
|----|------|-------|
| T1 | context | Collect remaining context (done inline: D-18 item 6, D-16 item 4, the per-session factory fact, the SDK resource API) | closed |
| T2 | implement | Implement per plan — `owner-queue.ts`, the queue injected from `serve()`, read tool, resource and ack (`src/server/*`) | closed |
| T3 | test | Red tests first, including the cross-session case — `test/server/owner-queue.test.ts` | closed |
| T4 | review | Self-review and prepare the PR — review round on the branch, findings fixed | in progress |
| T5 | implement | The TUI renders the owner-command status, with `queued` as a state rather than a failure | closed |
| T6 | test | End to end across two real MCP sessions against a live `serve()`, plus the resource read | closed |
| T7 | docs | CHANGELOG and minor version per D-13; the bound and the settling rules stated | closed |

Scaffold rows T2-T4 arrived from `flow init` with different titles; the mapping
above is what each id actually did in this flow.
