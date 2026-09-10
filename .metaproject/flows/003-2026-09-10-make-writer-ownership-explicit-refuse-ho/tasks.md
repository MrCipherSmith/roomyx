# Tasks

Task definitions live here; task **statuses** live in flow.json and are managed
only via `keryx flow task done <id> <taskId>`.

The four `origin: "scaffold"` rows exist from `flow init`; a row the plan
supersedes is closed with `--disposition skipped --reason "<why>"`.

| ID | Kind | Title |
|----|------|-------|
| T1 | context | Collect remaining context (done inline: D-18 items 1-4/7, the backlog's failing tests, in-scope files, existing tests) |
| T2 | test | Red tests first: `dispatcherAttached` both ways, no-flag append, `--force` gone, refusal under a fresh lease, take-over when stale, concurrent appends |
| T3 | implement | `dispatcherAttached`; the CLI decision table; `src/writer-lease.ts`; `--take-over` replacing `--force` |
| T4 | review | `code-verifier` + `review-orchestrator` on the branch; fix findings through `task-implementer` |
| T5 | test | End-to-end verification against a real bare `serve` and a real dispatcher-attached server — the ownership table, run rather than reasoned |
| T6 | implement | Structural writing: `--json`, `--body-file -`, `--many` (all-or-nothing batch) |
| T7 | docs | SKILL.md loses `--force` and defends nothing; CHANGELOG + `package.json` minor bump; confirm the log format is unchanged |
