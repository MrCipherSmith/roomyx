# roomyx-installer — specification

Version: 0.1.0

## Module Identity

- **Название:** `roomyx-installer` — packaging, project-local init, room registry, and skill-sync layer around the existing `roomyx` MCP server + TUI.
- **Тип:** npm package (`@mrciphersmith/roomyx`) with a CLI; a project-local `.roomyx/` directory created by that CLI; a second, standalone MCP server for skill management.
- **Статус:** `spec ready` — nothing implemented yet.

## Structure

```text
roomyx/                          # existing package (server/client), extended:
  src/
    cli.ts                        # extended: init, serve, client, skills, rooms subcommands
    installer/
      init.ts                      # `roomyx init` — creates .roomyx/
      registry.ts                   # room registry read/write/liveness-check
      skill-sync.ts                  # bundled-skill diff/backup/copy logic
    mcp-management/
      server.ts                     # the SECOND MCP server (skill sync tools)
    bundled-skills/
      startup-room/
        SKILL.md                     # the shipped, auto-launch-enabled skill

<project>/.roomyx/                # created by `roomyx init`, NOT part of the npm package itself
  config.json
  rooms/
    registry.json
  skills/
    startup-room/SKILL.md          # copy of the bundled skill, source of truth for diffing
```

## `.roomyx/config.json` shape

```json
{
  "schemaVersion": 1,
  "defaultPort": 4319,
  "roomLogDir": ".roomyx/rooms/logs"
}
```

## `.roomyx/rooms/registry.json` shape

```json
{
  "schemaVersion": 1,
  "rooms": [
    {
      "id": "r-7f3a2b",
      "port": 41235,
      "logPath": "/absolute/path/to/room.jsonl",
      "pid": 12345,
      "startedAt": "2026-09-09T12:00:00.000Z"
    }
  ]
}
```

- `id`: short, human-typeable slug (not a UUID) — generated at `roomyx serve` startup.
- Written by `roomyx serve` on startup; the entry is removed on clean shutdown (SIGINT/SIGTERM, already partially handled in `src/cli.ts`).
- **Never trusted blindly.** `roomyx client`'s auto-attach reads this file, then performs a real liveness check (a lightweight MCP call, e.g. `room.get_state`) against each candidate before treating it as attachable — a stale entry from a crashed process is pruned from the file, not silently believed.

## CLI Surface

- `roomyx init` — creates `.roomyx/` in the current directory with default `config.json`, empty registry, and the bundled skill copied into `.roomyx/skills/startup-room/SKILL.md` (a project-local staging copy — NOT yet the real `~/.claude/skills/...`; see `skills sync` below).
- `roomyx serve <logPath> [--port N] [--host H] [--acknowledge-non-loopback]` — unchanged from `roomyx`'s existing `serve`, extended to also register/deregister itself in `.roomyx/rooms/registry.json`.
- `roomyx client [--room <id>] [--connect <url>]` — unchanged connection behavior when `--connect` is given; new: `--room <id>` looks up the registry; no arguments at all triggers the auto-attach flow (find the one live room).
- `roomyx skills sync --target <claude|codex|keryx|all> [--dry-run] [--yes]` — copies `.roomyx/skills/startup-room/SKILL.md` into the target's real skill location. **Requires `--yes` to actually write** when the target is a real, non-fixture path (see `decisions.md` D-02) — without it, prints what it would do (equivalent to `--dry-run`) and exits without writing.
- `roomyx rooms list` — prints the live (liveness-checked) rooms from the registry.

## MCP Management Server (NEW — R4)

A second MCP server, independent of the per-room server in `roomyx`'s own `specification.md`. Started via `roomyx mcp` (long-lived, not tied to one room's lifetime — this one IS closer to `keryx serve`'s "separate long-lived daemon" shape, unlike the per-room server). Exposes:

| Tool | Input | Output |
|---|---|---|
| `roomyx.skills.sync` | `{ target: "claude" \| "codex" \| "keryx", dryRun?: boolean }` | `{ wouldWrite: string[], backedUp: string \| null, warnings: string[] }` — same underlying logic as the CLI's `skills sync`, callable from within an agent session |
| `roomyx.rooms.list` | — | current live (liveness-checked) room registry |

This is the piece the operator described as "MCP который можно подключить к Claude или Codex или keryx" — connectable via each runtime's own MCP client config, same as any other MCP server (no special-casing needed; reuses the loopback HTTP transport already built for `roomyx`'s room server).

## Skill Sync Mechanism (R5/R6)

1. Read the bundled `SKILL.md` (shipped in the npm package) and the target path's current content, if it exists.
2. If the target's current content differs from the LAST-SYNCED bundled version recorded in `.roomyx/config.json` (a stored hash, not just "differs from the new bundled version" — that would flag every sync as a conflict) — this means someone hand-edited the target since the last sync. Warn explicitly and require `--yes` to proceed (in addition to the target-is-real requirement already gating this).
3. Copy the current target file to `<target>.bak-<ISO-timestamp>` before overwriting.
4. Write the new bundled content to the target path.
5. Record the new content's hash in `.roomyx/config.json` as the "last synced" baseline for future diff-checks.

## Bundled `startup-room` SKILL.md Changes (R5)

The bundled copy adds, to the existing Setup/Kickoff section, an auto-launch step:

```text
If `roomyx` is available for this project (a `.roomyx/` directory exists, or the
`roomyx` command resolves on PATH), start a room server automatically at
kickoff: `roomyx serve <logPath> --port 0`, capture the printed room ID, and
relay it to the owner as part of the kickoff confirmation ("room ID: r-xxxxx —
attach with `roomyx client --room r-xxxxx`"). If `roomyx` is not available,
proceed exactly as today — this is additive, never a hard requirement for
running a startup-room session.
```

This exact wording is a first draft for the implementation phase to refine, not a final, binding text — the actual edit to the real global skill happens only at the explicit sync step (`decisions.md` D-02), giving a natural review point before it takes effect.

## Acceptance Criteria

| ID | Критерий | Статус |
|---|---|---|
| AC1 | `roomyx init` in an empty temp directory creates `.roomyx/config.json` and `.roomyx/rooms/registry.json` with valid default content | `spec ready` |
| AC2 | `roomyx serve` registers itself in the registry on start and removes its entry on clean shutdown (SIGINT) | `spec ready` |
| AC3 | `roomyx client` with no arguments attaches correctly when exactly one live room is registered, and gives a clear, distinguishable message for zero or multiple live rooms — verified with a real liveness check, not just registry presence (a registry entry for a killed process must not be treated as attachable) | `spec ready` |
| AC4 | `roomyx skills sync --target <fixture-path>` (never a real `~/.claude/...` path in this flow's own tests) correctly diffs, backs up, and writes, and refuses to write without `--yes` when the target has independent hand-edits since the last recorded sync | `spec ready` |
| AC5 | The MCP management server's `roomyx.skills.sync` and `roomyx.rooms.list` tools are reachable via a real MCP client round-trip (same testing pattern as `roomyx`'s own `serve.test.ts`) | `spec ready` |
| AC6 | No code path in this package's test suite ever writes to a real `~/.claude`, `~/.codex`, or project `.metaproject`/`.keryx` directory, or runs `npm publish` — all tests operate against temp/fixture paths | `spec ready` |

## Requirement Coverage Map

| Требование | Раздел спецификации | Статус |
|---|---|---|
| R1 — installable package | CLI Surface | `spec ready` |
| R2 — `.roomyx/` init | `.roomyx/config.json` shape, CLI Surface → `roomyx init` | `spec ready` |
| R3 — room registry + one-command attach | `.roomyx/rooms/registry.json` shape, CLI Surface → `roomyx client` | `spec ready` |
| R4 — MCP management server | MCP Management Server | `spec ready` |
| R5 — bundled auto-launching skill | Bundled `startup-room` SKILL.md Changes | `spec ready` |
| R6 — safe sync, not silent overwrite | Skill Sync Mechanism | `spec ready` |
