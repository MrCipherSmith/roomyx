# Acceptance Criteria

Rules:

- Criteria lines use the exact format `- ACn: <criterion>`.
- After `flow freeze` this file is checksum-protected: any edit outside
  `keryx flow ac update` fails every gate and status transition.
- Completion requires every ACn to be confirmed via
  `keryx flow ac confirm <id> <ACn>`.

Every criterion below names a reproduction that exists today and fails. Each is
checkable by running something, not by reading the diff.

## Criteria

- AC1: `roomyx room append <log> --kind <not-a-kind>` exits non-zero, writes nothing to the log, and names the legal kinds; the same for `--in-reply-to 0` and `--in-reply-to 1.5`. A test asserts that a log written by `appendMessage` always loads back through `loadRoomLog`, and it fails if the writer is allowed to emit what the reader refuses.
- AC2: 100 identical `setRoster` calls with an unchanged roster add zero entries to `Renderable.renderablesByNumber`, asserted by a test that reads the registry size before and after. Today it adds 5 per call.
- AC3: a tool-level error from the server changes neither the connection status nor the number of running poll loops, and its text reaches the transcript. A test drives a real `serve` whose log makes a tool throw, and asserts the client stays `connected`, keeps polling, and surfaces the message.
- AC4: `roomyx serve` with an MCP client attached exits within 5 seconds of `SIGTERM`, `SIGINT` and `SIGHUP`, and its registry entry is gone afterwards. A test attaches a real client before signalling; today the equivalent test signals with nothing attached.
- AC5: concurrent `appendMessage` calls against one log never produce two records with the same `seq`, asserted by a test that runs several writers against a shared start instant.
- AC6: a roster id containing `..` cannot direct the transcript export outside the working directory, and the status-bar notice names the path actually written. A test asserts both.
- AC7: `roomyx.skills.sync` over MCP writes nothing unless the caller explicitly asks for a write, matching what the CLI's own help promises; a test asserts a call carrying only `target` creates no file.
- AC8: the help overlay never draws content into its border and never loses the `? or Esc closes` line, at every terminal height from 10 to 40. A test sweeps the range and asserts the bottom border matches `/^└─+┘$/`.
- AC9: a participant name too long for the roster gutter renders truncated with a marker rather than as an empty row, at every length from 1 to 40 characters, asserted by a test.
- AC10: each of these three mutations turns its own named test file red — removing `horizontalScrollbarOptions: { visible: false }`, putting `renderer.destroy()` before `roomClient.stop()`, and deleting the `if (this.stopped) return;` guards. Evidence is the recorded output of running each mutation.
- AC11: `isRoomLive` reports a registry entry dead when the recorded pid no longer exists, so a recycled port cannot resurrect a dead room. A test registers an entry with a pid that does not exist against a live port and asserts the entry is not returned as live.
- AC12: `bun run check` passes, and the duplicate `ManagementServeOptions` declaration, the unused `jumpTo` `direction` parameter, the unused `commandHelp` `name` parameter, the uncalled `RoomClient.getAgentDetail` / `getLastSeenSeq`, and the `0/N` search counter are all gone.
