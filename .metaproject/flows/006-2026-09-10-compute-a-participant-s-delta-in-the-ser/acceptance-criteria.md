# Acceptance Criteria

Rules:

- Criteria lines use the exact format `- ACn: <criterion>`.
- After `flow freeze` this file is checksum-protected: any edit outside
  `keryx flow ac update` fails every gate and status transition.
- Completion requires every ACn to be confirmed via
  `keryx flow ac confirm <id> <ACn>`.

## Criteria

- AC1: `room.get_delta_for(agent_id)` with no cursor returns every message after that participant's own last message, excluding its own, and a test fails if the delta includes its own messages.
- AC2: The default cursor is that participant's last own `seq`, the delta excludes any message at `seq` equal to it, and a test fails if the boundary moves in either direction.
- AC3: An explicit `since_seq` overrides the default, its own messages are still excluded at any cursor (including `0`), and a test fails if the override is ignored or its own messages reappear.
- AC4: The response names the cursor it used and whether it came from the participant's last message or from the caller, and a test fails if the two cannot be told apart or the field is absent.
- AC5: An unknown `agent_id` returns an explicit not-found result rather than an empty delta, and a test fails if the two are indistinguishable.
- AC6: The tool's registered description does not claim the result is what the participant was *delivered* or has *received*, and a test fails if the wording makes that claim.
- AC7: The tool writes nothing to the room log — bytes and mtime unchanged — and a test fails if any call touches the file.
- AC8: `bun run check` passes, and the CHANGELOG records the new tool with the version position decided against D-13.
