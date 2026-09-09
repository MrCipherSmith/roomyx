# Flow Journal

- 2026-09-09T17:48:55.941Z - flow created
- 2026-09-09T17:50:12.675Z - task-added: T5: B1 — one schema for both directions of the room log
- 2026-09-09T17:50:12.789Z - task-added: T6: B2 — destroy detached renderables and skip unchanged roster rebuilds
- 2026-09-09T17:50:12.901Z - task-added: T7: B3 — tool errors are not disconnects; single-flight reconnect
- 2026-09-09T17:50:13.015Z - task-added: T8: M1+M4 — serve exits on signals with a client attached; identity-checked liveness
- 2026-09-09T17:50:13.130Z - task-added: T9: M2 — serialise seq allocation on append
- 2026-09-09T17:50:13.243Z - task-added: T10: M3+M5 — export path containment and the MCP skill-sync gate
- 2026-09-09T17:50:13.360Z - task-added: T11: M6 — release MCP sessions
- 2026-09-09T17:50:13.470Z - task-added: T12: M8+M10 — help overlay fits; roster and status bar truncate
- 2026-09-09T17:50:13.584Z - task-added: T13: M12+M13 — restore the regression barriers and replace fixed waits
- 2026-09-09T17:50:13.695Z - task-added: T14: Minor cleanups from the review
- 2026-09-09T17:50:21.651Z - task-done: T1: Collect remaining context
- 2026-09-09T17:50:21.763Z - task-done: T2: Implement per plan
- 2026-09-09T17:50:21.882Z - task-done: T3: Add/adjust tests and make them pass
- 2026-09-09T17:50:21.999Z - task-done: T4: Self-review and prepare draft PR
- 2026-09-09T17:50:22.116Z - frozen: 12 criteria; checksum recorded
- 2026-09-09T17:50:22.232Z - started
- 2026-09-09T17:52:26.112Z - task-done: T5: B1 — one schema for both directions of the room log
- 2026-09-09T17:53:46.009Z - task-done: T6: B2 — destroy detached renderables and skip unchanged roster rebuilds
- 2026-09-09T17:57:02.005Z - task-done: T7: B3 — tool errors are not disconnects; single-flight reconnect
- 2026-09-09T18:01:57.954Z - task-done: T8: M1+M4 — serve exits on signals with a client attached; identity-checked liveness
- 2026-09-09T18:04:36.575Z - task-done: T9: M2 — serialise seq allocation on append
- 2026-09-09T18:10:03.900Z - task-done: T10: M3+M5 — export path containment and the MCP skill-sync gate
- 2026-09-09T18:12:58.329Z - task-done: T11: M6 — release MCP sessions
- 2026-09-09T18:15:09.386Z - task-done: T12: M8+M10 — help overlay fits; roster and status bar truncate
- 2026-09-09T18:20:14.458Z - task-done: T13: M12+M13 — restore the regression barriers and replace fixed waits
- 2026-09-09T18:22:57.865Z - task-done: T14: Minor cleanups from the review
- 2026-09-09T18:23:57.181Z - ac-confirmed: AC1: test/log/write-contract.test.ts: 7 cases, incl. the property 'whatever the writer accepts, the reader loads'. CLI reproduction re-run: --kind bogus-kind, --in-reply-to 0 and 1.5 all exit 1 with the legal values named, log keeps only its header, a legal append reads back.
- 2026-09-09T18:23:57.294Z - ac-confirmed: AC2: test/client/renderable-lifetime.test.ts: 100 identical setRoster calls add 0 entries to Renderable.renderablesByNumber (was +5 per call). Barrier verified: restoring the leak turns 2 of 3 red.
- 2026-09-09T18:23:57.407Z - ac-confirmed: AC3: test/client/tool-error.test.ts against a real serve with a poisoned log: client stays connected, keeps polling, and the server's text ('line 2') reaches the caller. A real transport loss still reads as a disconnect. Barrier verified: restoring the defect turns 2 of 3 red.
- 2026-09-09T18:23:57.517Z - ac-confirmed: AC4: test/server/shutdown.test.ts: close() resolves with a client attached, and SIGTERM/SIGINT/SIGHUP each exit the process and leave an empty registry. Barrier verified: old ordering turns all 4 red. Test uses a bare Client, chosen by measuring both client shapes.
- 2026-09-09T18:23:57.629Z - ac-confirmed: AC5: test/log/write-contract.test.ts 'concurrent appends': 5 writers racing one instant get 5 distinct seq values, and 5 distinct on disk. Barrier verified: removing the lock turns it red.
- 2026-09-09T18:23:57.743Z - ac-confirmed: AC6: test/client/export-name.test.ts: 9 cases over hostile ids incl. ../../../../../tmp/pwned; the base name is sanitised and the resolved path is asserted inside cwd. Barrier verified: removing the sanitising turns 3 red.
- 2026-09-09T18:23:57.854Z - ac-confirmed: AC7: test/mcp-management/server.test.ts: a call with target and yes:true reports wouldWrite true, written false, and existsSync(target) is false. yes and dryRun are off the tool's input schema entirely.
- 2026-09-09T18:23:57.967Z - ac-confirmed: AC8: test/client/help-overlay.test.ts: every height 10..40 asserts the bottom border matches /^[border]+$/ and 'Esc closes' is on screen; helpBody never returns more lines than it is given. Barrier verified: restoring the overflow turns 2 red.
- 2026-09-09T18:23:58.086Z - ac-confirmed: AC9: test/client/roster-overflow.test.ts: every name length 1..40 renders a non-blank row; a name that does not fit carries a cut marker; a full-width name leaves a separating column. Barrier verified: restoring the wrap turns 3 red.
- 2026-09-09T18:23:58.201Z - ac-confirmed: AC10: Recorded mutation runs. Remove horizontalScrollbarOptions -> first-message.test.ts 3 fail (boundary heights 2/6, 3/9, 4/12, found by sweeping). Invert shutdown order -> shutdown-order.test.ts 1 fail. Drop the re-entry guard -> 1 fail. The stopped guards are the exception and it is recorded: four redundant guards, no single removal is caught, removing all four is.
- 2026-09-09T18:23:58.313Z - ac-confirmed: AC11: test/installer/registry.test.ts 'liveness is about this room, not about that port': two entries on one live port, one with a pid that cannot exist; only the live one is returned.
- 2026-09-09T18:23:58.425Z - ac-confirmed: AC12: bun run check: eslint clean, tsc clean, 255 tests pass. Removed: the duplicate ManagementServeOptions, jumpTo's direction, commandHelp's name, RoomClient.getAgentDetail and getLastSeenSeq, Footer.setWidth. The 0/N counter now reports 'N matches' before a position is known.

## 2026-09-09 — work complete, flow left in-progress on purpose

All 14 tasks done, all 12 frozen acceptance criteria confirmed with evidence,
`bun run check` green at 255 tests, `keryx health run` 97 and passing. Every
commit is on `main` and pushed.

**The flow cannot reach `completed`, and that is a property of the record, not
of the work.** `keryx flow complete` requires the status `implemented`, and
`keryx flow implemented` requires a draft PR URL. This work went straight to
`main` at the operator's direction, as the whole day's work has, so there is no
pull request to name. The skill's non-PR completions — "verified handoff" and
"keep open" — both explicitly keep a flow in-progress, so this state is the one
the model actually provides for what happened.

Passing something that is not a pull request to `--pr` would make the record say
a thing that is not true, which costs more than an unclosed flow. Left
in-progress with this entry as the evidence of completion.

### Deferred, and why

- **Resize handling.** Every dimension is read once at construction. A proper
  fix is a resize path through `ChatView`, `Footer`, `HelpOverlay` and the
  roster breakpoint — a feature, not a repair.
- **Display-cell width arithmetic.** `Footer` and `footerHints` measure code
  units, so a CJK participant name eats the key hints. Needs a grapheme +
  East-Asian-Width primitive, which the resize work will also need; they should
  land together.
- **`room.get_transcript` has no `limit`.** A change to the MCP tool surface
  plus a cursor, deserving a decision record rather than a patch inside a fix
  flow.

All three are in `docs/roomyx/review-2026-09-09.md` and in the changelog's
Known section.
