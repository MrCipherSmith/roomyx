# Tasks

Task definitions live here; task **statuses** live in flow.json and are managed
only via `keryx flow task done <id> <taskId>`.

The four `origin: "scaffold"` rows exist from `flow init`; a row the plan
supersedes is closed with `--disposition skipped --reason "<why>"`.

| ID | Kind | Title |
|----|------|-------|
| T1 | context | Collect remaining context (done inline: D-18 item 5, D-16 item 3, the fixture's boundary cases, `lastSeenSeq`'s precedent) |
| T2 | implement | Implement per plan — `getAgentDelta` in the log module, its type, the tool wrapper and its registration |
| T3 | test | The backlog's four failing tests plus the boundary and unknown-agent cases, written red first |
| T4 | review | A review round on the branch; findings fixed |
| T5 | test | End to end over a real MCP client: the delta for each fixture participant, and the description's wording as the client receives it |
| T6 | docs | CHANGELOG + version per D-13; the description must not overclaim |
