# ACTIONS

The current action list for roomyx, triaged against the code. Every status below
was checked by command or by reading the file named next to it — not carried over
from the previous list, which is how four already-finished items had been sitting
here as work.

## State

| | |
|---|---|
| Released | `@mrciphersmith/roomyx@0.8.1` (tag `v0.8.1`, published with provenance) |
| `main` | green: `bun run check` → 372 pass / 0 fail |
| Flows | 001, 002, 003, 004 — all `done` (`.metaproject/flows/`) |
| Decisions recorded, not implemented | D-18 items 5, 6, 8 |

## Triage

**R7's timeout half is closed** (flow 004, `0.8.1`): liveness answers
`live`/`gone`/`unknown`, only `gone` deletes or archives anything, and `rooms
list` prints `did not answer — still registered` rather than dropping the room.


`done` means the shipped code contradicts the item and the item should stop being
carried. `open` means the defect is still reachable. `partial` means one half
landed and the named half did not.

| Item | Status | Evidence |
|---|---|---|
| **S1** drop `targetPath` from the MCP tool | **done** | `grep -rn targetPath src/` → only the CLI's own flag (`src/cli.ts:610`) and the comment explaining the removal (`src/mcp-management/server.ts:59,75`) |
| **S2** Origin/Host validation on both transports | **done** | `enableDnsRebindingProtection` + both allowlists in `src/server/http-transport.ts`; D-06a recorded |
| **S3** `init` clobbers the staged skill | **partial** | the clobber is fixed (`src/installer/init.ts:53` — `existsSync` guard). See *Do now* for what is left |
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
| **R10** `get_transcript` has no `limit` | **open** | `src/server/index.ts:71` — the input schema is `{ since_seq }` and nothing else |
| **R12** the status bar drops the threshold | **open** | `grep threshold\|criteria src/client/components/status-bar.ts` → no match |
| D-18 item 5 `room.get_delta_for` | **open** | not in `src/` |
| D-18 item 6 owner-command queue | **open** | not in `src/` |
| D-18 item 8 state-update shape | **not schedulable** | needs a decision first |

**The previous list undercounted.** It carried D-18 items 5, 6 and 8 and nothing
else, while three live defects sat in the backlog: R7's timeout half, R10 and
R12. A list written from the session's own work is a list of what that session
was looking at, not of what is broken.

## Do now — each is small, and each has a named victim

1. **S3 residual — the staged skill is written once and never refreshed.**
   `src/installer/init.ts:53` skips the copy when the file exists, so after an
   upgrade `.roomyx/skills/startup-room/SKILL.md` keeps the old text silently —
   no hash, no backup, no warning, which is what the backlog asked `syncSkill`
   to provide. `grep -rn "skills/startup-room" src/` shows nothing reads the
   staged copy at all: `skills sync` uses `bundledSkillPath()` from the package.
   So decide: route it through `syncSkill` (as the backlog says) or stop writing
   a file nothing consumes.
2. **R10 — `limit` on `room.get_transcript`.** A cold attach at `since_seq: 0`
   hands the entire transcript to a language model in one text block. The
   backlog's own framing is the reason to do it: *"That isn't 20 ms of CPU, it's
   a context window."* Split as the backlog suggests — `limit` and a cursor now,
   memoization later, and only if someone runs a room long enough to care.
3. **R12 — the threshold belongs on screen.** The room exists to cross a number
   and the number is not displayed. Same line as `setNotice`, so a refusal's own
   sentence gets truncated too. Inherit the wrap primitive rather than hand-roll
   a second one.

## Next, after those

4. **D-18 item 6 — the owner-command queue** (`room.get_pending_owner_commands`,
   `room://owner-queue`, `room.ack_owner_command`). Highest value of the three
   decisions: `room.post_owner_command` still answers `accepted: false` for the
   primary scenario, because a model-driven orchestrator spawns `serve` and
   `onOwnerCommand` is a JS function that cannot be injected into it. `prd.md`
   R5's criterion has no measurable form until an ack exists.
5. **D-18 item 5 — `room.get_delta_for`.** Do it after item 6, not with it: same
   tool file, and bundling two changes into one review stops the review from
   being about either.

## Needs a decision before code

6. **D-18 item 8 — a representation for `goal_edit` / `add_participant`.**
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

## Working notes that cost time

- **`gh` reverts to the other account between calls.** Every push needs
  `gh auth switch --user MrCipherSmith` in the same command; else the failure is
  `Permission … denied to aleksandr-tsaitler`, which names the account and not the
  cause.
- **`flow complete` refuses on `tasks` while the review task is open.** Close it
  in the review round, not at the end. Cost flows 002 and 003 a round each.
- **IP literals in text written to disk get redacted.** A source file was written
  containing `[REDACTED:ip]` as the loopback host, which threw at runtime while
  every test passed — the tests build their URLs from the same constant. Build
  host strings from octets, and grep written files for the marker after a bulk
  write.
- **Stray `roomyx serve` processes hold the shell's pipe open**, so later
  commands look like they hang. Kill them after manual probing.
