# roomyx (MCP server MVP)

Implements the read-side (R2/R3/R4) of `docs/requirements/roomyx/specification.md`.
See that spec for the full architecture; this README documents only the
concrete on-disk log format the tests in this package assume, since it isn't
fully pinned down by the JSON Schemas alone (those describe one message and
one goal contract shape, not the log file as a whole).

## Room log format (JSONL)

One JSON object per line (`\n`-terminated). The **first line** is a `state`
record; every subsequent line is a `message` record.

```jsonl
{"type":"state","goal_contract":{"version":1,"goal_statement":"...","criteria":"...","threshold":{"fail_below":300,"pass_at_or_above":325}},"roster":[{"id":"yuki","name":"Юки"}]}
{"type":"message","seq":1,"from":"yuki","body":"..."}
{"type":"message","seq":2,"from":"omar","in_reply_to":1,"kind":"challenge","body":"..."}
```

- `state.goal_contract` matches `../docs/requirements/startup-room-framework/schemas/goal-contract.schema.json`.
- Each `message` record matches `../docs/requirements/startup-room-framework/schemas/message-envelope.schema.json` (plus the literal `"type":"message"` discriminator, which is a log-format detail, not part of the envelope schema itself).
- `roster` entries are `{ id, name }` — `id` is what `room.get_agent_detail` takes as `agent_id`; `name` is the display name used in `from`.

This format is this package's own design choice (not dictated by either JSON
Schema) — see `docs/requirements/roomyx/specification.md`'s Manifest/Config
Shape section, which defers the on-disk representation to implementation.

## Status

`draft` — server (`src/server/`) not yet implemented (T3). Tests (`test/`)
and this format documentation exist first, per TDD (see the flow's `plan.md`).
