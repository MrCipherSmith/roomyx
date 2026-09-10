# ACTIONS

The current action list for roomyx, triaged against the code. Every status below
was checked by command or by reading the file named next to it — not carried over
from the previous list, which is how four already-finished items had been sitting
here as work.

## State

| | |
|---|---|
| Released | `@mrciphersmith/roomyx@0.10.0` (tag `v0.10.0`, published with provenance) |
| `main` | green: `bun run check` → 398 pass / 0 fail |
| Flows | 001–005 `done`; PRs #5, #8, #9 were small changes without a flow |
| Decisions recorded, not implemented | D-18 items 5, 8 |

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
| D-18 item 5 `room.get_delta_for` | **open** | not in `src/` |
| D-18 item 6 owner-command queue | **done** | released `0.10.0` (flow 005, PR #10): the queue is created in `serve()` so every session shares it, with `room.get_pending_owner_commands`, `room://owner-queue` and `room.ack_owner_command` |
| D-18 item 8 state-update shape | **not schedulable** | needs a decision first |

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

1. **D-18 item 5 — `room.get_delta_for`.** The last implementable decision item:
   it takes the per-turn cursor arithmetic out of the orchestrator's context.
   Note the two things this flow learned that apply to it — the server factory is
   per session, so anything shared belongs in `serve()`; and the import direction
   is index → owner-queue, which a new tool module should follow rather than
   reverse.
2. **`resources/subscribe` on the owner queue**, which this flow deliberately
   left out: the server can push here (it receives the command itself, unlike the
   transcript), but a subscription only means something once a host acts on the
   notification, and no host in this project has been shown to. Out of scope for
   a reason, not forgotten.

## Needs a decision before code

3. **D-18 item 8 — a representation for `goal_edit` / `add_participant`.**
   `loadRoomLog` requires every line after the header to satisfy
   `messageLineSchema`, so a second `state` line makes the room unreadable
   forever, and the header cannot be rewritten. A permitted record type with
   last-wins semantics and a distinguished message kind differ in what
   `room.get_state` means and in what history can be replayed. Owner's call.

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

## Review dispatch is not producing anything

Two consecutive flows (002, 004) dispatched a read-only reviewer for a code
review, and **both returned only their opening line** — rounds exhausted, no
findings. That is three review rounds whose cost was paid and whose result was
zero, and it is now the reason flows 004 and 005 were self-reviewed, which is
weaker evidence.

Worth deciding separately, and it is not a code change: either the dispatch
budget is too small for the amount of reading asked for (`max_rounds` 10-14 to
read ~6 files plus tests), or the reviewers need a narrower question, or the
nested read-only workers should be replaced by a direct diff review in the
orchestrator's own context. **Do not keep paying for a round that returns
nothing** — check the first reply before dispatching the second.

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
