# Changelog

Notable changes to `@mrciphersmith/roomyx`. Generated release notes say what
changed; this file exists for the two things they cannot say — **why**, and
**what to do if you were relying on the old behaviour**.

Format loosely follows [Keep a Changelog](https://keepachangelog.com). Versions
are [semantic](https://semver.org), with the `0.x` convention that breaking
changes land in the minor position.

## [Unreleased] — 0.5.0

The security release. Every item here came out of a review of the published
0.4.0 that reproduced each finding before recording it; the full list is in
[`docs/roomyx/improvement-backlog.md`](docs/roomyx/improvement-backlog.md).

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
  exiting 1. It now asserts that the packed, installed artifact reports a
  version equal to the tag — stricter than the manifest check beside it, which
  compares the repository rather than what the artifact says when it runs.

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
