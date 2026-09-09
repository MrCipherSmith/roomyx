# roomyx-installer — PRD

Version: 0.1.0

## Problem

`roomyx` (MCP server + TUI client) works, but only as raw source: run from inside the `arena` repo with `bun src/cli.ts`/`bun src/client/index.ts`, manually copy-pasting a printed URL between two terminals. There is no way to install it into a project, no room registry (so "attach the TUI to the room" means remembering a port number), and no integration with the actual `startup-room` dispatcher — a real room today has no way to automatically expose itself over MCP at all.

## Goal

Turn `roomyx` into an installable tool: `npm install`, `roomyx init` in a project, then a single command each to start a room's server and to attach a TUI to it — with the `startup-room` skill itself able to auto-launch that server when a room starts, so the operator doesn't have to remember to do it by hand.

## Users

- **Оператор (altsay)** — wants `roomyx client` (no arguments) to just work when a room is running, without remembering a URL or port.
- **Диспетчер (Claude Code / Codex / keryx, running a startup-room session)** — should be able to auto-launch a room server at kickoff without the operator asking for it explicitly, and the mechanism must degrade gracefully if roomyx isn't installed in a given project.

## Requirements

### R1 — Installable package
`@mrciphersmith/roomyx` ships as one npm package exposing a `roomyx` CLI with subcommands: `init`, `serve`, `client`, `skills sync`, `rooms list`. `private: true` until an explicit publish decision (see Non-goals).

### R2 — `.roomyx/` project directory, explicit init
`roomyx init` (never an npm postinstall hook — matches keryx's own install-then-explicit-init convention) creates `.roomyx/` in the current project: config, room registry, and a bundled copy of the updated `startup-room` skill.

### R3 — Room registry + one-command attach
`roomyx serve` generates a room ID, registers `{id, port, logPath, pid, startedAt}` in `.roomyx/rooms/registry.json`, and removes its own entry on clean shutdown. `roomyx client` with no arguments finds the one live, registered room (verified by an actual liveness check, not just trusting a possibly-stale registry entry) and attaches; `--room <id>` attaches to a specific one; multiple live rooms or zero live rooms are both reported clearly, never silently guessed.

### R4 — MCP management server for skill sync
A second, separate MCP server (not the per-room one from `roomyx`) exposing tools to sync the bundled skill into `.claude`/`.codex`/`.keryx` conventions. Connectable to any of the three as an ordinary MCP server — no new transport invented, reuses the same Streamable HTTP over loopback pattern as `roomyx`'s room server (`decisions.md` D-06 in that package).

### R5 — Bundled, auto-launching `startup-room` skill
The package carries an updated copy of `startup-room`'s `SKILL.md` whose Setup/Kickoff section, if `roomyx` is installed for the project, starts a room server automatically and relays the room ID to the operator. Must degrade gracefully (skill works exactly as today) when `roomyx` isn't installed — this is an enhancement, not a new hard dependency for every startup-room user.

### R6 — Safe sync, not silent overwrite
Syncing the bundled skill into `~/.claude/skills/startup-room/SKILL.md` (or the `.codex`/`.keryx` equivalents) must never silently discard hand-made changes: back up the existing file before overwrite, and warn if the existing file has content not present in the last-synced bundled version (i.e. someone edited it by hand since the last sync).

## Success Criteria

- `roomyx init` in a fresh project creates a working `.roomyx/` without requiring manual file edits.
- `roomyx serve` + `roomyx client` (no args) attach correctly when exactly one room is running, and give a clear, non-confusing answer when zero or multiple rooms are running.
- The skill-sync mechanism is demonstrated end-to-end against a throwaway fixture directory standing in for `~/.claude/skills/`, with a real before/after diff and a real backup file produced — before it is ever pointed at the real global skill directory.
- Nothing in this package's implementation phase actually runs `npm publish` or overwrites the real `~/.claude/skills/startup-room/SKILL.md` without a separate, explicit confirmation at the moment of doing so.

## Risks

- **Clobbering the live skill file.** `~/.claude/skills/startup-room/SKILL.md` is in active use (this very conversation's methodology depends on its current content, refined through the whole meta-review earlier in this session). An automatic, un-reviewed overwrite risks losing that refinement. Mitigated by R6 (backup + diff-warning) and the explicit checkpoint in `README.md`'s Non-goals — the actual sync-against-the-real-file action is gated on a separate confirmation, not bundled into "implement the sync mechanism."
- **Stale room registry.** A crashed `roomyx serve` process leaves a registry entry pointing at a dead port; `roomyx client`'s auto-attach must verify liveness, not just registry presence, or it will confidently attach to nothing.
- **npm package name availability.** `@mrciphersmith/roomyx` is presumed available (matches the existing `@mrciphersmith/keryx` scope) but not verified against the live npm registry before this spec was written — verify at actual publish time, not assumed now.
- **Claiming a public package name is a one-way door.** Publishing `@mrciphersmith/roomyx` to the public npm registry claims that name; unpublishing has npm-side restrictions (a name can't always be freely reused afterward). This is why publish is a separate, explicit action in this spec, not a default outcome of "package it."

## Recommendation

Build R1-R4 (installable package, `.roomyx/` init, room registry, MCP management server) fully — these are additive, low-risk, and testable against fixtures with no real-world side effects outside the current project. Build R5/R6 (the bundled skill + sync mechanism) and demonstrate them against a throwaway fixture directory. Stop there and get an explicit go-ahead before ever running the sync against the real `~/.claude/skills/` directory, and before running `npm publish` for real.
