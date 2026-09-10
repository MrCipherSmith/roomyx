# Acceptance Criteria

Rules:

- Criteria lines use the exact format `- ACn: <criterion>`.
- After `flow freeze` this file is checksum-protected: any edit outside
  `keryx flow ac update` fails every gate and status transition.
- Completion requires every ACn to be confirmed via
  `keryx flow ac confirm <id> <ACn>`.

## Criteria

- AC1: `room.get_state` reports `dispatcherAttached: true` for a server built with an owner-command handler and `false` for one built without it, and a test fails if the field is absent or reports either case wrongly.
- AC2: `roomyx room append --force` is no longer an accepted flag, and a test fails if the flag is still honoured.
- AC3: Against a live room served by a bare `roomyx serve` (no dispatcher), `roomyx room append` writes without any override flag, and a test fails if a flag is still required in that case.
- AC4: Against a live room with a dispatcher attached and a fresh writer lease, `room append` refuses and `--take-over` refuses too, and a test fails if either writes.
- AC5: `--take-over` writes when the live room's writer lease is stale or absent, and the log gains a `status` message recording the ownership change, produced through `appendMessage` so it cannot bypass the reader's schema.
- AC6: Two concurrent appends to one log never both succeed against a fresh lease, and a test fails if both writes land.
- AC7: `room append --json <envelope>` writes a body byte-identical to the input including embedded quotes and newlines; `--body-file -` reads the body from stdin; `--many` writes a batch whose `seq` values are consecutive, and an invalid line in the batch writes nothing at all.
- AC8: `src/bundled-skills/startup-room/SKILL.md` no longer instructs `--force`, and its documented append command succeeds against a bare `roomyx serve` as written — verified by running the documented command, not by reading it.
- AC9: `bun run check` passes, `package.json` is a minor bump to `0.8.0`, `CHANGELOG.md` records the removal of `--force` as the breaking change it is, and the room-log format is unchanged.
