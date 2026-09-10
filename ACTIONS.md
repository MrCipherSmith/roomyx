# ACTIONS

The current action list for roomyx, triaged against the code. Every status below
was checked by command or by reading the file named next to it — not carried over
from the previous list, which is how four already-finished items had been sitting
here as work.

## State

| | |
|---|---|
| Released | `@mrciphersmith/roomyx@0.11.0` (tag `v0.11.0`, published with provenance) |
| `main` | green: 433 tests, 0 fail (the count includes the persona library's own tests) |
| Flows | 001–007 `done`; PRs #5, #8, #9 were small changes without a flow |
| Decisions recorded, not implemented | none — the state-update decision shipped in `0.11.0` as **D-20** (was mis-numbered D-19; the owner's D-19 is the persona library) |

## Triage

**R7's timeout half is closed** (flow 004, `0.8.1`): liveness answers
`live`/`gone`/`unknown`, only `gone` deletes or archives anything, and `rooms
list` prints `did not answer — still registered` rather than dropping the room.

**S3 is closed** (PR #8, `0.8.2`): decided as *route it through `syncSkill`*.
The staged copy is refreshed when it is still ours, left untouched and reported
when hand-edited or unrecorded, and adopted when byte-identical to the bundled
skill — which is what lets a moved project refresh again, since the recorded
hashes are keyed by absolute path. Two documents were corrected in the same PR:
the backlog no longer prescribes `--force` (removed in 0.8.0), and
`room.post_owner_command` is described in both files as implemented **and
unreachable for the consumer it was designed for**.


`done` means the shipped code contradicts the item and the item should stop being
carried. `open` means the defect is still reachable. `partial` means one half
landed and the named half did not.

| Item | Status | Evidence |
|---|---|---|
| **S1** drop `targetPath` from the MCP tool | **done** | `grep -rn targetPath src/` → only the CLI's own flag (`src/cli.ts:610`) and the comment explaining the removal (`src/mcp-management/server.ts:59,75`) |
| **S2** Origin/Host validation on both transports | **done** | `enableDnsRebindingProtection` + both allowlists in `src/server/http-transport.ts`; D-06a recorded |
| **S3** `init` clobbers the staged skill | **done** | released `0.8.2` (PR #8): the staged copy goes through `syncSkill` — refreshed when it is ours, left alone and reported when hand-edited, adopted when byte-identical so a moved project can refresh again |
| **S4** release job uses `--frozen-lockfile` | **done** | `.github/workflows/release.yml:58` and `ci.yml:16` both use it |
| **R1** the reading surface | **done** | scrolling, wrapping, hierarchy and the reply marker shipped (0.5.x; marker in 0.7.2 by flow 002). `tui-review.md` records the before/after frames |
| **R2** "disconnected" against a healthy server | **done** | `ToolError`/`isError` handling and the pre-bind `loadRoomLog` (D-09, `src/server/serve.ts`) |
| **R3** `roomyx room new\|append` | **done** | both commands exist; D-01a written |
| **R4** the package cannot speak when it fails | **done** | `bin` → hand-written `.mjs` launchers (`package.json`) |
| **R5** session reaper + D-06 amendment | **done** | sweeper, `terminateSession()`, unknown-session 404 in `src/server/http-transport.ts`; D-06a |
| **R8** the CLI has no argument grammar | **done** | spec-driven parser in `src/cli/args.ts` |
| **R9** SIGTERM with a client attached | **done** | `closeAllConnections()` and cleanup-after-close (`http-transport.ts`, `server/shutdown.ts`) |
| release smoke test that cannot fail | **done** | `.github/workflows/release.yml:111` now asserts `--help` exits 0, with the defect in the comment |
| **R7** a timeout prunes a live room | **done** | flow 004, release `0.8.1`: `Liveness` is `live`/`gone`/`unknown`, only `gone` prunes or archives, and `rooms list` reports an unanswered room instead of dropping it |
| **R10** `get_transcript` has no `limit` | **done** | released `0.9.0` (PR #9): the response is `{ messages, has_more, next_seq }`, the default is bounded at 200, and the cursor advances only over messages actually returned |
| **R12** the status bar drops the threshold | **done** | released `0.9.0` (PR #9): the threshold is on the line, and over-long lines end with `clip()`'s marker instead of being cut by the pane edge |
| D-18 item 5 `room.get_delta_for` | **done** | released `0.10.3` (flow 006, PR #11): the delta is computed in the server, reporting `since_seq` and `cursor_from` so an empty delta is distinguishable from a wrong cursor |
| D-18 item 6 owner-command queue | **done** | released `0.10.0` (flow 005, PR #10): the queue is created in `serve()` so every session shares it, with `room.get_pending_owner_commands`, `room://owner-queue` and `room.ack_owner_command` |
| D-18 item 8 state-update shape | **decided** | **D-20**: a message kind with the structured change beside a readable body, and `room.get_state` folds the stream. Shipped in `0.11.0` |

**The previous list undercounted.** It carried D-18 items 5, 6 and 8 and nothing
else, while three live defects sat in the backlog: R7's timeout half, R10 and
R12. A list written from the session's own work is a list of what that session
was looking at, not of what is broken.

## Do now — each is small, and each has a named victim

Nothing small is left open. R10 and R12 shipped in `0.9.0`; R7's timeout half in
`0.8.1`; S3 in `0.8.2`. The backlog's remaining unscheduled items are checked
below and each needs a decision or a larger change rather than an afternoon.

**R10's other half is still open and deliberately split.** The backlog names two
halves — `limit`-and-cursor (now done) and memoization. `loadRoomLog` re-reads and
zod-validates the whole append-only file **on every call**, so the poll loop pays
a full parse once a second. That was called speculative until someone runs a room
long enough to care, and it still is: no measurement exists. Do not do it on the
strength of this line — measure first.

## Next

Every implementable item from the backlog and from D-16/D-18 has now shipped.
What is left is decisions and follow-ups, not tasks:

1. **`resources/subscribe` on the owner queue**, which this flow deliberately
   left out: the server can push here (it receives the command itself, unlike the
   transcript), but a subscription only means something once a host acts on the
   notification, and no host in this project has been shown to. Out of scope for
   a reason, not forgotten.

## Needs a decision before code

2. **D-18 item 8 / D-20 — a representation for `goal_edit` / `add_participant`.**
   **Decided 2026-09-10** (see `decisions.md` D-20): a message kind carrying the
   structured change beside a readable body, with `room.get_state` folding the
   stream. Two reasons it is the message route rather than a second record type:
   a state record would be **invisible in the terminal** (a person reads the
   transcript, not the records), and the transcript is already the project's
   channel for state changes ("state changes must also enter the transcript as
   ordinary text"). It also finally fills `updated_in_round` / `updated_by`,
   which the schema has carried since the beginning with nothing writing them.

## Doc drift to fix while nearby

- The backlog's R3 definition of done still prescribes `--force` (line ~120),
  which 0.8.0 removed in favour of `--take-over`. The backlog is the document an
  implementer reads, and it now describes a flag that no longer exists.
- `docs/roomyx/improvement-backlog.md` and `docs/roomyx/README.md` both describe
  `room.post_owner_command` as implemented; it is implemented *and unreachable*
  for the primary consumer. That distinction belongs in D-18 item 6's write-up,
  not only here.

## Known open, verified, not scheduled

- **`RoomState` construction by an external embedder** is exercised by no test.
  `dispatcherAttached` is asserted present-and-true/false in
  `test/server/dispatcher-attached.test.ts`, but never absent — the treatment of
  an absent value ("cannot be shown") is asserted only for `log_path`.
- **Windows path semantics** for the writer lease directory were never verified.
- **`appendMessages` is all-or-nothing only for the failures it can observe**; an
  I/O failure mid-append leaves the earlier lines, and the bound is stated on the
  function because the append-only contract rules out a temp-file rename.

## DECIDED 2026-09-10: main outrunning a flow is routine, not a problem

Flows 005 and 006 both collided with work the repository owner pushed to `main`
while the branch was open — `0.10.1` and `0.10.2` in flow 006 alone. Each
collision cost a rebase plus a version renumber.

**Decided: accept the renumbering as routine.** The owner publishes to `main`
concurrently and that is not something to work around; the hierarchy is
unambiguous — their release is published, mine is not, so mine moves. The rule to
apply every time: take the branch's version number from `main` at merge time and
bump past whatever the owner has shipped, never renumber or rewrite their
CHANGELOG text, and expect at least one collision per flow. Branch numbers are
therefore provisional until merge.

## DECIDED 2026-09-10: raise the review dispatch budget

Four consecutive flows (002-005) dispatched a read-only reviewer that **returned
only its opening line** — rounds exhausted, no findings. The cost was paid four
times and bought nothing, and it is why flows 004-006 were self-reviewed, which
is weaker evidence than an independent round.

**Decided: raise the budget, and check the first reply before dispatching
again.** The dispatches asked a reviewer to read ~6 files plus their tests within
`max_rounds` 10-14; the likely cause is that the reading is larger than the budget
rather than that the question was wrong. Next round: `max_rounds: 24`,
`max_tool_calls: 60`, and a narrower opening question. If a reviewer still returns
nothing, the fallback is the one already used and known to work — the author's own
round, with executed mutations as the evidence, labelled as the weaker thing it
is. **Never dispatch a second round before reading the first reply.**

## Working notes that cost time

- **`gh auth switch` stopped working mid-session, and the reliable route is an
  explicit token.** After PR #8, `gh auth switch --user MrCipherSmith` reported
  success and `gh auth status` agreed, while the merge and the push still ran as
  `aleksandr-tsaitler` (`does not have the correct permissions to execute
  MergePullRequest`; `403` on push, because git's credential helper resolves the
  account independently of gh's active account). What works:
  `T=$(gh auth token --user MrCipherSmith)` then
  `GH_TOKEN="$T" gh pr merge …` for gh, and
  `git push "https://x-access-token:$T@github.com/MrCipherSmith/roomyx.git" <ref>`
  for git. Do not trust the switch report.
- **A commit made on the wrong branch is recoverable in seconds, and the window
  matters.** PR #9's first push went straight to `main` because the branch was
  never created. `git branch <name>` + `git reset --hard` + `--force-with-lease`
  fixed it before any tag or release existed. The lesson is the cheap one: check
  `git branch --show-current` before the first commit of a change, not after.
- **`flow complete` refuses on `tasks` while the review task is open.** Close it
  in the review round, not at the end. Cost flows 002 and 003 a round each.
- **IP literals in text written to disk get redacted.** A source file was written
  containing `[REDACTED:ip]` as the loopback host, which threw at runtime while
  every test passed — the tests build their URLs from the same constant. Build
  host strings from octets, and grep written files for the marker after a bulk
  write.
- **Stray `roomyx serve` processes hold the shell's pipe open**, so later
  commands look like they hang. Kill them after manual probing.
- **`git checkout -- <file>` during a mutation reverts an uncommitted fix.** The
  mutation procedure must be: commit, then mutate, then revert to the commit.
  Cost flow 004 a round of re-applying its own fix.
- **`git checkout -- <file>` during a mutation reverts uncommitted work.** Hit for
  the THIRD time (flows 004, 005, 007), each time costing a re-apply. The order is
  the whole fix: **commit the change, then mutate, then `git checkout`** — the
  revert then takes only the mutation. Written down twice before and still hit, so
  treat "commit first" as a step in the mutation procedure rather than a reminder.
- **`git reset --hard origin/main` after a squash merge discards the flow's own
  post-completion state**, because it is uncommitted. Order that works: complete
  the flow, commit its package, then reconcile with `main` — or rebuild the state
  with the CLI, which owns `flow.json`.
- **A small change is a PR, not a flow.** PRs #5 and #8 were made without a flow
  package; inventing one for #8 created a `flows/005-*` directory with no
  `flow.json`, which `keryx flow list` does not see and nothing would ever close.
  Decide first whether the work is managed, and only then scaffold.
- **DeepSeek's API exposes two models:** `deepseek-flash` and `deepseek-v4-pro`.
  There is no `v4.1` (neither flash nor pro — the API answers "supported API model
  names are deepseek-flash, deepseek-v4-pro"), and `deepseek-v4-flash`,
  `deepseek-chat` and `deepseek-reasoner` are **aliases that all answer as
  `deepseek-flash`**. So a `model_tier` cannot rank generations here, and
  asking for `deepseek-reasoner` gets no reasoning model.
