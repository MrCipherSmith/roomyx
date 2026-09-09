# Changelog

Notable changes to `@mrciphersmith/roomyx`. Generated release notes say what
changed; this file exists for the two things they cannot say — **why**, and
**what to do if you were relying on the old behaviour**.

Format loosely follows [Keep a Changelog](https://keepachangelog.com). Versions
are [semantic](https://semver.org), with the `0.x` convention that breaking
changes land in the minor position.

## [Unreleased]

Found by running the published 0.5.0 by hand, then by putting ten screenshots
of it in front of four reviewers — design, accessibility, CLI ergonomics,
onboarding. Their ranked outcome is in
[`docs/roomyx/tui-review.md`](docs/roomyx/tui-review.md); the first two items
are below.

### Added

- **The transcript scrolls, and the arrows belong to it.** `↑`/`↓` by a line,
  `PgUp`/`PgDn` by a page, `Ctrl-U`/`Ctrl-D` by a half, `g`/`G` to the top and
  back to the bottom. The roster keeps its selection on `j`/`k`.

  Before this, no key scrolled anything: the arrows moved the roster, so four
  keypresses on a room taller than the pane moved one caret and left the stream
  apparently frozen. A room that outgrew its pane could not be read back at
  all.

  **`:` opens the owner prompt.** `o` means *open* nearly everywhere and was
  borrowed rather than chosen. It still works and is not documented, so a habit
  from 0.5.0 does not break on upgrade.

  The keymap is now data in `src/client/keymap.ts` rather than an `else if`
  chain inside the keypress handler — which is how it could be wrong without
  being visibly wrong, since there was no artefact anyone could read to answer
  "what keys does this have?". A test asserts no two bindings claim the same
  key, because a first-match-wins resolver silently shadows the loser.

- **A footer, generated from that keymap.** Keys on the right, liveness on the
  left — and the liveness is a fact that *moves*: a message count and the age
  of the newest message. A word that has always said the same thing stops being
  read, which is precisely why a dead room looked like a live one; the header
  differed from a working room by one word in the same ink. When the number
  stops, the silence means something.

  An empty room now says `connected · waiting for the first message` rather
  than showing a void that reads as a hang. Scroll away from the bottom and the
  footer says so and says how to return. On a terminal too narrow for
  everything, hints drop one at a time by usefulness — the first version
  dropped all of them at once, which took the keys away in the two states that
  most need them.

  Shipped in the same change as the rebind on purpose. A footer is a keymap's
  confession: shipping it first would have printed `↑/↓ roster` on the screen
  as documented behaviour, and made the correction more expensive.

- **The transcript has a hierarchy.** A message is a bright speaker name with a
  dim `kind re #n` tag beside it, and the body indented underneath in a dimmer
  ink, with a blank line between turns. Consecutive turns from one speaker
  share a header — a real room had the same nine-character prefix nine times
  running, which hides the one thing a header is for.

  Before this every message was one line, one colour, one weight, and a wrapped
  continuation began at the same column as a new turn, so sixteen messages were
  a single grey wall. The indent is what makes a wrap read as a continuation.

  It costs vertical space: a turn is three rows where it was one, so fewer
  turns fit on a short terminal. The shared headers pay most of that back in a
  room where people speak in runs.

- **The roster gives up its 24 columns below 80.** At 72 columns it was
  spending a third of the terminal on a few short names while the messages
  wrapped to 46. A fixed gutter is also where non-Latin names die — three CJK
  characters are six cells, not three. Below the breakpoint the stream takes
  the full width and the footer says how many participants are in the room;
  widen the terminal and the list comes back.

- **Search, with `/` and `n`/`N`.** Matched case-insensitively against what is
  on screen — the speaker's display name, the kind tag and the body — so
  searching for `Ann` finds messages headed `Ann` rather than every message
  from the id `a`. The footer names the live query and the match position, and
  says `no matches` rather than standing still, because a search that finds
  nothing must not look like one that found something.

- **`?` shows the full keymap,** generated from the same table the dispatcher
  and the footer use. The footer teaches the handful of keys worth permanent
  space; everything else lives here rather than in the source.

- **`w` writes what is on screen to a file** and names it. A terminal is a bad
  place to search and a good place to read. It never overwrites — the next free
  numbered name is used — and a filtered view gets its own file.

- **Connection changes are written into the transcript, not only the footer.**
  A footer repainted at a fixed row, with the cursor parked in another pane, is
  never spoken by a screen reader and never survives a `tee`. A `— disconnected,
  retrying —` line in the stream lands in speech, in scrollback and in the log
  at once.

### Fixed

- **Closing the client no longer dumps a stack trace.** `SIGTERM`/`SIGINT`/
  `SIGHUP` had no handler at all, so killing an attached client tore the
  renderer down underneath a live poll: the poll lost its connection, called
  `handleDisconnect`, and wrote "disconnected" into an already-destroyed text
  buffer — `TextBuffer is destroyed`, ten frames of stack, at someone who just
  closed a window. `q` and Ctrl-C escaped it only because that path happened to
  stop the client first. All four now share one ordered shutdown that stops
  polling before destroying the renderer.

- **Long messages are no longer silently cut.** `message-row.ts` set
  `height: 1` with no wrapping, so every message was clipped at the pane width
  with no ellipsis and nothing to scroll — and what got cut was the end of the
  sentence, which in a room of arguing agents is where the claim is. Bodies now
  wrap on word boundaries.

- **`kind` and `in_reply_to` are displayed.** Both are in `MessageEnvelope` and
  both were written by the dispatcher and rendered by nothing. The
  challenge/answer structure that is the point of the log schema was visible in
  the log and invisible in the viewer of that log. Rows now read
  `Ann [challenge re #1]: …`.

- **A pane holding its first messages before its first layout pass no longer
  drops message 1.** The horizontal scrollbar occupies a viewport row whether
  or not there is anything to scroll, leaving `maxScrollTop` at 1 on a pane
  that is not full, so sticky-bottom scrolled down by one.

  Narrower than [the backlog][backlog] claims, and that correction is recorded
  there: the real client always paints a `[connecting…]` frame before its first
  poll returns, so it never triggered this. No 0.4.0 or 0.5.0 user lost a
  message to it. Fixed because it is one line and a trap for whoever later
  makes the client paint after its first batch rather than before.

### Known

- **A word ending exactly at the wrap column loses its last character** —
  `whether scrolling or` draws as `whether scrollin` / `or`, with the `g` gone
  rather than wrapped. Width-dependent: 120 columns is clean, 90 is not. Not
  worked around, on purpose: a one-column right margin makes it disappear at
  60, 72, 108 and 120 and leaves it at 90, which would turn a reproducible
  defect into an intermittent one. `test/client/wrap-defect.test.ts` holds the
  reproduction as a tripwire that starts failing the day it is fixed upstream.

### Fixed (continued)

- **`room append`'s refusal no longer asks you to assert something false.** It
  ended "Pass `--force` if you know it isn't" — but the ordinary way to meet
  that message is a room served by bare `roomyx serve`, which is genuinely live
  and simply has no dispatcher, so there is no second writer to race. The
  registry records that a room serves a path, not whether anything dispatches
  into it, so the message now says what is known and leaves the judgement to
  the operator.

[backlog]: docs/roomyx/improvement-backlog.md

## [0.5.0] — 2026-09-09

The security release. Every item here came out of a review of the published
0.4.0 that reproduced each finding before recording it; the full list is in
[`docs/roomyx/improvement-backlog.md`](docs/roomyx/improvement-backlog.md).

### Added

- **`roomyx room new` and `roomyx room append`.** There was no supported way to
  create the file `roomyx serve` takes. The only tool that made one was
  `src/cli/seed.ts` — shipped in the package, absent from `bin` and the README,
  and documented only as a call through an absolute path into the global
  `node_modules`. Time-to-first-room is this product's central number and that
  was the path to it.

  `new` refuses to overwrite an existing log. `append` refuses when the
  registry shows a live room serving that path, because that room's dispatcher
  is the log's single writer; `--force` overrides. Recorded as **D-01a**: D-01
  constrains the server, not the package, and the invariant is one writer per
  *live* room.

  `src/cli/seed.ts` is removed, superseded by these.

- **The `bin` entries are Node launchers.** They used to be the TypeScript
  files themselves, carrying a `#!/usr/bin/env bun` shebang. On a machine
  without Bun that failed as `/usr/bin/env: 'bun': No such file or directory` —
  a kernel message with no roomyx text in it, and no way to add any, because a
  shebang is an `execve` dispatch with no slot for a diagnostic.

  `engines.bun` was not protecting anyone either: npm's engine check only ever
  knew `node` and `npm`, so a package declaring `bun: ">=99.0.0"` installs
  cleanly under `--engine-strict`.

  roomyx now says what is missing and where to get it, and exits 1. **It does
  not install Bun** — an install-time network fetch is what installer D-01
  exists to refuse. Nothing is transpiled and `src/*.ts` is still the shipped
  artifact. As a side effect, npm's generated Windows `.cmd` shim now has a
  Node script to wrap rather than a `.ts` file.

- **One argument grammar, and a real `--help` for every command.** The CLI had
  two hand-rolled argv scanners with different semantics and no notion of what
  a flag *is*, so it could not tell a value from a positional, a typo from an
  option, or a number from a switch. Measured against 0.4.0:

  | | did |
  | --- | --- |
  | `serve --port 0 room.jsonl` | served a file literally named `--port`, on the default port |
  | `serve --help` | **started a server** and minted a room ID |
  | `serve room.jsonl --port` | listened on port 1, via `Number(true)` |
  | `serve room.jsonl --port abc` | `NaN`, so a silent ephemeral port |
  | `skills sync … --dryrun` | ignored the typo and did the opposite of the ask |
  | `roomyx --help` | printed usage to stderr and exited 1 |
  | `rooms list --registry X` | read the default registry and reported on it |

  Flags are declared per command now. Unknown ones are refused with a
  did-you-mean, missing and non-numeric values are refused, `--help` exits 0 on
  stdout, a bad command exits 1 on stderr, and `--` ends flag parsing.

### Changed — breaking

- **`Enter` filters the stream instead of opening a modal, and the modal is
  gone.** `AgentModal` could not be scrolled, did not compose with search, cost
  a keypress to leave, and was pinned at `top: 2, left: 2` — so, being 70% of
  the terminal wide, it lay across the roster it had been opened from and left
  a selection arrow pointing at a name it had covered.

  Filtering shows the same data from the transcript the client already has, in
  the pane the reader is already in, and `Esc` clears it. The server's
  `agent.detail` tool is unchanged; the client no longer needs it to answer
  "show me this participant".

### Removed — breaking

- **`roomyx.skills.sync` no longer accepts `targetPath`.** The MCP tool took a
  literal path and passed it to the writer, which made it an arbitrary-path
  file writer on an unauthenticated loopback port. Reproduced: a cross-origin
  request wrote the bundled skill over a file of the caller's choosing, with
  the directory created for it.

  **If you were using it:** pass `target` instead — `claude`, `codex`, `keryx`
  or `all`. If you were embedding `serveManagement()` and relied on a literal
  path, note that `keryx` resolves project-locally and `ManagementOptions` now
  takes a `cwd` to control what "project" means. The **CLI** keeps its
  literal-path escape hatch (`roomyx skills sync --target /some/path`), because
  that is the operator on their own machine. The network surface does not get
  one.

### Security

- **DNS-rebinding protection is on for both servers.** Before this, an
  `initialize` carrying `Origin: https://evil.example` and
  `Host: roomyx.attacker.test` completed the handshake and could call tools —
  so any page in a tab the operator had open could reach `roomyx serve` and
  `roomyx mcp` cross-origin. D-06 reasoned that loopback binding made the
  threat local; it does not constrain a browser. Recorded as **D-06a**.

  This is not authentication, and D-06's no-token decision stands. The guard
  stops browsers. A local process sends no `Origin` and passes, which is the
  trust boundary D-06 drew on purpose.

- **`@modelcontextprotocol/sdk` floor raised to `>=1.25.0`,** as part of the
  guard rather than as dependency hygiene. Measured across thirty releases: the
  guard appears in 1.13.3, but before 1.24.0 it rejects requests with no
  `Origin` header — which is every request roomyx's own client and liveness
  probe make. Option forwarding to this transport begins at 1.25.0. Leaving the
  range at `^1.0.0` would have shipped a guard that silently does nothing on a
  fresh install.

### Fixed

- **The release job installs with `--frozen-lockfile`,** matching CI. It used to
  resolve freely, so a release could ship a dependency version CI never tested —
  with provenance attached to a tree nobody verified.

- **The release smoke test can now fail.** It ran
  `roomyx --help > /dev/null 2>&1 || true`, discarding the output, the exit code
  and then any remaining signal. It passed every release while `--help` was
  exiting 1 — reporting success on a defect it was standing next to. It now
  asserts that the packed, installed artifact runs `--help` with exit 0 and
  reports a version equal to the tag. The second half is stricter than the
  manifest check beside it: that one compares what the repository says, this
  compares what the artifact says when it runs.

- **The management server closes its sessions on shutdown.** The HTTP transport
  had been written twice and the copies had drifted; one of them skipped this.
  Both servers now share `src/server/http-transport.ts` (**D-07**).

### Changed

- `ManagementOptions` gains `cwd`, which is what project-scoped skill targets
  resolve against. It defaults to `process.cwd()` — right for `roomyx mcp`,
  wrong for a long-lived server embedded in a host whose working directory
  belongs to someone else.

## [0.4.0] — 2026-09-09

- Owner commands reach the TUI: `o` opens a prompt for veto / constraint /
  add-participant / goal-edit. Against a room served by bare `roomyx serve` the
  answer is an honest refusal — no dispatcher is attached, and accepting a
  command nothing will act on would be a lie.
- The bundled `startup-room` skill is the real methodology with roomyx's steps
  folded in, rather than a placeholder.
- `roomyx --version`.
- `docs/roomyx/testing-story.md`: a walkthrough where every command was run
  against the packed build.

## [0.3.0] — 2026-09-09

- `roomyx skills sync` on the CLI, with named targets (`claude`, `codex`,
  `keryx`, `all`) resolving to each runtime's real skill location.
- `room.post_owner_command` on the server: it forwards to a dispatcher-supplied
  handler and never writes to the log (**D-01**).
- The registry stores an absolute `logPath`. It always claimed to; the code
  stored whatever argv held, so `roomyx serve ./room.jsonl` left a path
  meaningless to a client started elsewhere.
- `roomyx client` and `roomyx mcp` subcommands.

## [0.2.1] — 2026-09-09

- Stop crashing in a project that was never `roomyx init`-ed. `rooms list`
  printed a bare `ENOENT` and `roomyx-client` printed a stack trace, both for
  the ordinary case of "no room has been started here yet". `roomyx serve` was
  worse: it bound its port and only then died registering itself.

## [0.2.0] — 2026-09-09

- `roomyx-client` ships as a binary. The README had promised `roomyx client`
  and a running server printed the same, but no such command existed — the TUI
  was unreachable in 0.1.0.
- README documents the commands, both MCP servers' tools, the `.roomyx` layout
  and the skill-sync refusals, and states that Bun must be on `PATH`.

## [0.1.0] — 2026-09-09

First publish. MCP server over a room log, terminal UI, room registry with
liveness checking, skill-sync, and a management MCP server.
