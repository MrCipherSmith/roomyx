# Plan

Order is by blast radius, not by severity: the log writer first because the
malformed line it admits is what triggers the reconnect storm, then the client
lifetime defects, then the server lifecycle, then the rest.

## Fixing

| Task | Finding | Shape of the fix |
|---|---|---|
| T5 | B1 | One schema for both directions. `appendMessage` parses the envelope before writing; the CLI rejects a bad `--kind`/`--in-reply-to` with the legal values. Removes the `as never`. |
| T6 | B2 | `destroyRecursively()` after `remove()` in both teardown sites, and `setRoster` returns early when the roster is unchanged. |
| T7 | B3 | `callTool` checks `isError` and throws a typed `ToolError`; poll loops surface it without disconnecting. Reconnect becomes single-flight with a generation counter. |
| T8 | M1, M4 | Close sessions before waiting on the HTTP server, `closeAllConnections()`, handle `SIGHUP`, guard re-entry, and deregister after the close resolves rather than before. |
| T9 | M2 | Serialise `nextSeq` + append under the lock discipline the registry already has. |
| T10 | M3, M5, M7 | Slugify the export basename and report the written path; drop `yes` from the MCP tool's schema and gate `syncSkill` on an explicit affirmative. |
| T11 | M6 | Session reaper with a last-seen timestamp, and `terminateSession()` at the three closing sites. |
| T12 | M8, M10 | Help overlay fits the height it is given; roster and status bar truncate with a marker instead of losing a word to a clipped wrap. |
| T13 | M12, M13 | Restore the three regression barriers, each proved by running the mutation; replace the fixed-timeout waits with predicate waits. |
| T14 | minors | Duplicate interface, dead parameters and methods, the `0/N` counter, the prototype-chain flag check, the misplaced `withLock` doc block, the leaking temp dirs. |

## Deferred, with the reason

- **M7 — no resize handling.** Every dimension is read once at construction and
  there is no listener anywhere. Fixing it properly means a resize path through
  `ChatView`, `Footer`, `HelpOverlay` and the roster breakpoint, which is a
  feature rather than a repair. Recorded for its own flow.
- **M9 — the footer measures code units, not display cells.** Needs a width
  function over graphemes and East-Asian-Width, applied in `Footer` and in
  `footerHints`. Same class as M7: a correctness fix that introduces a new
  primitive, and it should land with the resize work that will use it.
- **M11 — `room.get_transcript` has no `limit`.** A protocol change to the MCP
  tool surface plus a cursor. It deserves a decision record, not a patch inside
  a fix flow.

Each deferred item stays in `docs/roomyx/review-2026-09-09.md` and is named
here, so nothing is closed by silence.
