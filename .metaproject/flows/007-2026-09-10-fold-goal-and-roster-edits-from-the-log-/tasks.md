# Tasks

Task definitions live here; task **statuses** live in flow.json and are managed
only via `keryx flow task done <id> <taskId>`.

The four `origin: "scaffold"` rows are T1-T4; T5 and T6 were added by the plan.
A row the plan supersedes is closed with `--disposition skipped --reason "<why>"`.

| ID | Kind | Title | State |
|----|------|-------|-------|
| T1 | context | Collect remaining context (D-19, D-08, the schema/store/writer split, the fixture's no-edit baseline) | closed |
| T2 | implement | `messageChangeSchema` and the shape rule in the schema module — the rule in one place | closed |
| T3 | test | Red tests first: the fold, its order, the skipped non-edit, the unedited log unchanged | closed |
| T4 | review | A review round on the branch; findings fixed | in progress |
| T5 | test | End to end: append an edit and read the folded state through `room.get_state`, over a real client | closed |
| T6 | docs | README's log-format section, CHANGELOG, minor version; the `archiveRoom` divergence recorded | closed |

The scaffold titles were generic ("Implement per plan", "Add/adjust tests and
make them pass", "Self-review and prepare draft PR"); the mapping above is what
each id actually did.
