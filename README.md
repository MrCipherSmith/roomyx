# roomyx

An MCP server and terminal UI for `startup-room`: it reads a room's append-only log and exposes what's happening in it — roster,
goal contract, transcript, per-agent detail — both to MCP clients as tools and
to a human as a live TUI. It also ships a room registry, so several rooms can
run at once and be found by id, and a skill-sync path that installs the bundled
`startup-room` skill into a project without ever silently overwriting local
edits.

roomyx never writes to a room log. Owner commands do exist —
`room.post_owner_command` takes a veto, constraint, added participant or goal
edit — but the tool only forwards them to the dispatcher that runs the room.
The log keeps exactly one writer, which is what the room's consistency rests
on.

## Requirements

**[Bun](https://bun.sh) 1.1 or newer must be on your `PATH`.** Both binaries are
shipped as TypeScript with a `#!/usr/bin/env bun` shebang and are executed by
Bun directly — there is no compiled or transpiled build step. Installing with
npm works fine, but the commands will not run on a machine that has only Node.

## Install

```bash
npm install -g @mrciphersmith/roomyx
# or
bun install -g @mrciphersmith/roomyx
```

## Quick start

```bash
cd your-project
roomyx init                    # scaffold .roomyx/
roomyx serve path/to/room.jsonl   # serve one room log over MCP
```

`serve` prints the room's URL and its generated id:

```
roomyx serving path/to/room.jsonl at http://127.0.0.1:4319/mcp
room ID: r-a1b2c3 — attach with `roomyx-client --room r-a1b2c3`
```

Then, in a second terminal, attach the TUI:

```bash
roomyx-client                # auto-attaches when exactly one room is live
roomyx-client --room r-a1b2c3
```

In the TUI: `↑`/`↓` move through the roster, `Enter` opens the selected agent's
modal, `Esc` closes it, `q` or `Ctrl-C` quits. `o` opens an owner command —
pick `v`eto, `c`onstraint, `a`dd participant or `g`oal edit, type the body,
`Enter` sends. While the prompt is open it owns the keyboard, so a `q` in a
veto is text rather than a quit.

## Commands

The TUI ships as its own binary, `roomyx-client`, because it is a separate
process with a lifetime independent of `serve` and `mcp` — closing it does
nothing to the room. `roomyx client`, with a space, starts that same TUI from
the single `roomyx` binary; it is an alias for convenience, not a second
implementation, and it does not tie the TUI's lifetime to anything.

### `roomyx init`

Creates `.roomyx/` in the current directory: `config.json`, an empty room
registry, and a staged copy of the bundled `startup-room` skill. It never
clobbers a registry that already has rooms in it, and never overwrites an
existing `config.json`.

### `roomyx serve <logPath> [flags]`

Serves one room log as an MCP server over StreamableHTTP, and registers the room
in the local registry for the duration of the process. On `SIGINT`/`SIGTERM` it
deregisters itself and shuts down cleanly.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--port <n>` | `4319` | Listen port. `0` picks an ephemeral one. |
| `--host <addr>` | `127.0.0.1` | Bind address. |
| `--acknowledge-non-loopback` | off | Required to bind anything other than loopback. Without it, a non-loopback `--host` is refused. |
| `--registry <path>` | `.roomyx/rooms/registry.json` | Registry file to register into. |

Multiple independent MCP client sessions against one `serve` process are
supported: each new session gets its own transport and server instance, keyed by
`mcp-session-id`.

### `roomyx rooms list`

Lists rooms that are **confirmed live**, not merely present in the registry —
each entry is verified with a real MCP round-trip, and entries that don't answer
are pruned from the registry file as a side effect.

### `roomyx mcp [flags]`

Starts the management MCP server (room listing + skill-sync). Default port
`4320`. See **Management server** below for tools and flags.

### `roomyx skills sync --target <claude|codex|keryx|all|path> [flags]`

Installs the bundled `startup-room` skill into a runtime's skill location.

| Target | Path |
| --- | --- |
| `claude` | `~/.claude/skills/startup-room/SKILL.md` |
| `codex` | `~/.codex/skills/startup-room/SKILL.md` |
| `keryx` | `<cwd>/.metaproject/project-skills/startup-room/SKILL.md` |
| `all` | all three of the above |
| anything else | taken as a literal path |

| Flag | Default | Meaning |
| --- | --- | --- |
| `--yes` | off | Actually write. **Without it nothing is written** — the run reports what it would do and stops. |
| `--dry-run` | — | Says the same thing explicitly. Redundant unless paired with `--yes`, which it overrides. |
| `--config <path>` | `.roomyx/config.json` | Where the last-synced hashes are recorded. |

Requires `roomyx init` to have run, since that is what creates the config the
sync records into.

**This copies over the target; it does not merge into it.** If you already
maintain a fuller `startup-room` skill, fold the bundled text into it by hand
rather than pointing `--yes` at it. See **Skill sync safety** below for what
roomyx refuses outright.

### `roomyx-client [flags]`

The terminal UI. `roomyx client` (space, not hyphen) is the same entry — an
alias so a single `roomyx` binary can attach without a second command on PATH.
`roomyx-client` remains the dedicated binary: a separate process, independent
lifetime from `serve`/`mcp`.

| Flag | Meaning |
| --- | --- |
| `--room <id>` | Attach to a specific live room by id. |
| `--connect <url>` | Attach to an explicit MCP URL. Wins outright; the registry is not consulted. |
| `--registry <path>` | Registry file to resolve rooms from. |

With no flags it auto-attaches when exactly one room is live, and refuses with a
list of candidate ids when more than one is.

## MCP tools

### Per-room server — `roomyx serve`

| Tool | Input | Returns |
| --- | --- | --- |
| `room.get_state` | — | Roster and current goal contract. |
| `room.get_transcript` | `since_seq: number` | Messages with `seq` greater than `since_seq`, in order. |
| `room.get_agent_detail` | `agent_id: string` | One participant's own messages and last-seen status. |
| `room.post_owner_command` | `kind: veto \| constraint \| add_participant \| goal_edit`, `body: string` | `{ accepted, reason? }` from the dispatcher. |

`room.post_owner_command` forwards; it never writes. A dispatcher supplies a
handler when it embeds the server (`onOwnerCommand` in `serve()`). A room served
by bare `roomyx serve` has no dispatcher, so the tool answers `accepted: false`
and says so — better than accepting a command nothing will act on.

### Management server

A second, standalone MCP server exposing the installer surface — room listing
and skill-sync — to any MCP client.

| Tool | Input | Returns |
| --- | --- | --- |
| `roomyx.rooms.list` | — | Live, liveness-checked rooms. |
| `roomyx.skills.sync` | `target?: claude \| codex \| keryx \| all` or `targetPath?: string`, `dryRun?: boolean`, `yes?: boolean` | One result per target: whether it would write, whether it did, and where the backup went. |

Start it with `roomyx mcp` (default port `4320`, so it does not collide with
`roomyx serve`'s `4319`). Same loopback / `--acknowledge-non-loopback` rules as
`serve`. It is also a library entry point (`serveManagement` in
`src/mcp-management/server.ts`) for embedding hosts to bind.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--port <n>` | `4320` | Listen port. `0` picks an ephemeral one. |
| `--host <addr>` | `127.0.0.1` | Bind address. |
| `--acknowledge-non-loopback` | off | Required to bind anything other than loopback. |
| `--registry <path>` | `.roomyx/rooms/registry.json` | Registry file to list rooms from. |
| `--config <path>` | `.roomyx/config.json` | Config file skill-sync records hashes in. |

## Skill sync safety

Neither `roomyx skills sync` nor `roomyx.skills.sync` will silently discard
local work. Both refuse to write, and report a warning instead, in two cases —
unless `--yes` / `yes: true` is passed:

- the target has changed since roomyx last synced it (hand-edited), or
- the target already exists but roomyx has **no record of ever having written
  it**, so its content is not roomyx's to overwrite.

When it does write, it first copies the previous content to a timestamped
`.bak-<iso>` file alongside the target, and records the new content's hash in
`.roomyx/config.json` under `lastSyncedHashes`.

## On-disk layout

```
.roomyx/
├── config.json                     # schemaVersion, defaultPort, roomLogDir, lastSyncedHashes
├── rooms/
│   └── registry.json               # live room registry
└── skills/
    └── startup-room/SKILL.md       # staged copy of the bundled skill
```

`config.json`'s `roomLogDir` (default `.roomyx/rooms/logs`) is a convention for
where room logs are expected to live; `init` records it but does not create the
directory, and `serve` takes whatever path you hand it.

The registry is written under an exclusive lockfile and replaced by
write-to-temp-then-rename, so concurrent `serve` processes can't lose each
other's registrations or be read mid-write. A lock whose holder crashed is
reclaimed after 30 seconds, and a release only unlinks the lockfile when it
still holds the token that call wrote.

## Room log format (JSONL)

One JSON object per line (`\n`-terminated). The **first line** is a `state`
record; every subsequent line is a `message` record.

```jsonl
{"type":"state","goal_contract":{"version":1,"goal_statement":"...","criteria":"...","threshold":{"fail_below":300,"pass_at_or_above":325}},"roster":[{"id":"yuki","name":"Юки"}]}
{"type":"message","seq":1,"from":"yuki","body":"..."}
{"type":"message","seq":2,"from":"omar","in_reply_to":1,"kind":"challenge","body":"..."}
```

- `state.goal_contract` matches the `goal-contract` schema from the
  `startup-room` framework's specification (arena project).
- Each `message` record matches that framework's `message-envelope` schema
  (plus the literal `"type":"message"` discriminator, which is a log-format
  detail, not part of the envelope schema itself).
- `roster` entries are `{ id, name }` — `id` is what `room.get_agent_detail`
  takes as `agent_id`; `name` is the display name used in `from`.

This format is this package's own design choice, not dictated by either JSON
Schema: the specification defers the on-disk representation to implementation,
and the schemas describe one message and one goal contract, not the log file as
a whole. It is documented here because the tests in this package assume it.

## Development

```bash
bun install
bun run check      # lint + typecheck + test
```

Releases are cut by pushing a `v*` tag whose version matches `package.json`; the
release workflow verifies, packs, smoke-tests, and publishes to npm with
provenance via trusted publishing.

## Further reading

- [`docs/roomyx/testing-story.md`](https://github.com/MrCipherSmith/roomyx/blob/main/docs/roomyx/testing-story.md)
  — a verified end-to-end walkthrough, from `npm install` to driving a live
  room, including what keryx shell can and cannot do with roomyx.

Full architecture and the reasoning behind each decision:

- [`docs/roomyx/specification.md`](https://github.com/MrCipherSmith/roomyx/blob/main/docs/roomyx/specification.md)
  and [`docs/roomyx/decisions.md`](https://github.com/MrCipherSmith/roomyx/blob/main/docs/roomyx/decisions.md)
- [`docs/roomyx-installer/specification.md`](https://github.com/MrCipherSmith/roomyx/blob/main/docs/roomyx-installer/specification.md)
  and [`docs/roomyx-installer/decisions.md`](https://github.com/MrCipherSmith/roomyx/blob/main/docs/roomyx-installer/decisions.md)

## License

MIT
