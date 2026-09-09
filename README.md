# roomyx

MCP server + terminal UI for `startup-room`: live room status, chat, per-agent
modal, an installable room registry, and skill-sync. See
`docs/roomyx/specification.md` and `docs/roomyx-installer/specification.md`
for the full architecture; this README documents only the concrete on-disk
log format the tests in this package assume, since it isn't fully pinned down
by the JSON Schemas alone (those describe one message and one goal contract
shape, not the log file as a whole).

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

This format is this package's own design choice (not dictated by either JSON
Schema) — see `docs/roomyx/specification.md`'s Manifest/Config Shape section,
which defers the on-disk representation to implementation.

## Install

```bash
npm install -g @mrciphersmith/roomyx
```

## CLI

```bash
roomyx init                       # scaffold .roomyx/ in the current project
roomyx serve <logPath> [--port N] # start an MCP server for one room log
roomyx rooms list                 # list live rooms from the local registry
roomyx client [--room <id>]       # attach the terminal UI (auto-attaches if exactly one room is live)
```
