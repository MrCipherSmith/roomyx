# Acceptance Criteria

Rules:

- Criteria lines use the exact format `- ACn: <criterion>`.
- After `flow freeze` this file is checksum-protected: any edit outside
  `keryx flow ac update` fails every gate and status transition.
- Completion requires every ACn to be confirmed via
  `keryx flow ac confirm <id> <ACn>`.

## Criteria

- AC1: A liveness check distinguishes `live`, `gone` and `unknown` as three values, and a test fails if a probe that could not reach the room returns anything other than `unknown`.
- AC2: An entry whose registered pid is running but whose port does not answer is NOT removed from `registry.json`, and a test fails if the entry disappears from the persisted file.
- AC3: Such an entry writes no history record, and a test fails if `history.jsonl` gains a line for a room that was never confirmed gone.
- AC4: An entry that is confirmed gone — an identity mismatch, or a registered pid that is not running — is still pruned from the file AND archived to history, and a test fails if either half stops happening.
- AC5: `listLiveRooms` returns confirmed-live rooms only, so auto-attach (`resolve-connection`) cannot select a room that did not answer; the unconfirmed set is a separate channel, and a test fails if an unconfirmed room appears in the confirmed list.
- AC6: `roomyx rooms list` prints a registered-but-unanswered room distinctly instead of omitting it, and still prints exactly `No live rooms.` for a registry with no entries at all — verified by running the command, not by reading it.
- AC7: `bun run check` passes with no newly failing test, and the CHANGELOG records the change with its version position decided against D-13.
