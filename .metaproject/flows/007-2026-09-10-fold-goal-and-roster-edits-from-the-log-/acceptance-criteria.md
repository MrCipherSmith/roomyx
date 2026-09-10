# Acceptance Criteria

Rules:

- Criteria lines use the exact format `- ACn: <criterion>`.
- After `flow freeze` this file is checksum-protected: any edit outside
  `keryx flow ac update` fails every gate and status transition.
- Completion requires every ACn to be confirmed via
  `keryx flow ac confirm <id> <ACn>`.

## Criteria

- AC1: A log whose messages carry no edits yields exactly the state it yields today, and a test fails if adding the fold changes what an unedited log reads as.
- AC2: A `goal_edit` message carrying a goal contract is folded, so `room.get_state` returns the edited contract with `updated_by` set to `owner`, and a test fails if the header's contract is returned instead.
- AC3: Two goal edits fold in `seq` order with the later one winning, and a test fails if order or precedence is wrong.
- AC4: An `add_participant` message folds into the roster, and a test fails if the roster is unchanged or the addition is lost.
- AC5: The schema refuses an edit message whose `change` is absent or does not match its kind — verified through the append path, which must not write one — and a test fails if such a write succeeds.
- AC6: A message whose `change` the schema refuses, present in a hand-edited log, is skipped by the fold and does not make the log unreadable; the message still appears in the transcript, and a test fails if reading throws or if the edit folds.
- AC7: Reading and folding never modify the file: bytes and mtime are unchanged, and the header still holds its original content after edits have been folded.
- AC8: The structured change is not rendered into the message pane — the message row shows its body text — and a test fails if JSON reaches the transcript.
- AC9: `bun run check` passes, `docs/roomyx/README.md` documents the new field and kinds, and CHANGELOG records the change with a version position decided against D-13.
