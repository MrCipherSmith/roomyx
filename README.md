# roomyx

An MCP server and terminal UI for `startup-room`: it reads a room's append-only log and exposes what's happening in it — roster,
goal contract, transcript, per-agent detail — both to MCP clients as tools and
to a human as a live TUI. It also ships a room registry, so several rooms can
run at once and be found by id, and a skill-sync path that installs the bundled
`startup-room` skill into a project without ever silently overwriting local
edits.

roomyx is **read-only** with respect to a room log. Nothing here writes messages
into a room; the write path (`room.post_owner_command`) lives in the
`startup-room` framework, not in this package.

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
modal, `Esc` closes it, `q` or `Ctrl-C` quits.

## Commands

The orchestrator and the TUI are **separate binaries on purpose** — they are
independent processes, and making the TUI a subcommand of `roomyx` would tie
their lifetimes together. That is why it is `roomyx-client`, with a hyphen, and
not `roomyx client`.

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

### `roomyx-client [flags]`

The terminal UI.

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

### Management server

A second, standalone MCP server exposing the installer surface — room listing
and skill-sync — to any MCP client.

| Tool | Input | Returns |
| --- | --- | --- |
| `roomyx.rooms.list` | — | Live, liveness-checked rooms. |
| `roomyx.skills.sync` | `targetPath: string`, `dryRun?: boolean`, `yes?: boolean` | Sync outcome: whether it would write, whether it did, and where the backup went. |

This server currently has **no CLI command** — it is exposed as a library entry
point (`serveManagement` in `src/mcp-management/server.ts`) for embedding hosts
to bind.

## Skill sync safety

`roomyx.skills.sync` will not silently discard local work. It refuses to write,
and returns a warning instead, in two cases — unless `yes: true` is passed:

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

Full architecture and the reasoning behind each decision:

- [`docs/roomyx/specification.md`](https://github.com/MrCipherSmith/roomyx/blob/main/docs/roomyx/specification.md)
  and [`docs/roomyx/decisions.md`](https://github.com/MrCipherSmith/roomyx/blob/main/docs/roomyx/decisions.md)
- [`docs/roomyx-installer/specification.md`](https://github.com/MrCipherSmith/roomyx/blob/main/docs/roomyx-installer/specification.md)
  and [`docs/roomyx-installer/decisions.md`](https://github.com/MrCipherSmith/roomyx/blob/main/docs/roomyx-installer/decisions.md)

## License

MIT
