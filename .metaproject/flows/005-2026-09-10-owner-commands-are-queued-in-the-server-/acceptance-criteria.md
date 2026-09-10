# Acceptance Criteria

Rules:

- Criteria lines use the exact format `- ACn: <criterion>`.
- After `flow freeze` this file is checksum-protected: any edit outside
  `keryx flow ac update` fails every gate and status transition.
- Completion requires every ACn to be confirmed via
  `keryx flow ac confirm <id> <ACn>`.

## Criteria

- AC1: A command posted through one MCP session is readable through `room.get_pending_owner_commands` from a **different** session of the same server, and a test fails if the two sessions disagree.
- AC2: A post against a server with no `onOwnerCommand` handler reports `status: "queued"` and an id, not `accepted: false`, and a test fails if a command that is in fact queued is reported as anything but queued or refused.
- AC3: `resources/list` advertises `room://owner-queue`, and reading that resource returns the same pending set as the tool; a test fails if the resource is absent or its contents differ.
- AC4: `room.ack_owner_command` removes a command from the pending set, and refuses an unknown id with an explicit error rather than reporting success; a test fails either way.
- AC5: A dispatcher that supplied `onOwnerCommand` still receives every posted command, its verdict is reported as `accepted` or `refused` with its reason, and an accepted-or-refused command no longer appears among the pending — and a test fails if a settled command remains pending or is delivered twice.
- AC6: The queue is bounded; when it is full, posting is refused with a reason naming how many commands are waiting, and a test fails if the queue grows past its bound.
- AC7: No surface in this flow writes the room log — the file's bytes and mtime are unchanged across post, read, acknowledge and resource-read — and a test fails if any of them touches it.
- AC8: `bun run check` passes, CHANGELOG records the response-shape change as the breaking part of a minor version per D-13, and the TUI renders `queued` as a state rather than as a failure.
