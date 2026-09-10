# Acceptance Criteria

Rules:

- Criteria lines use the exact format `- ACn: <criterion>`.
- After `flow freeze` this file is checksum-protected: any edit outside
  `keryx flow ac update` fails every gate and status transition.
- Completion requires every ACn to be confirmed via
  `keryx flow ac confirm <id> <ACn>`.

## Criteria

- AC1: A message carrying `in_reply_to` renders the parent author's display name in its tag; the raw sequence number does not appear in the rendered pane.
- AC2: The kind and the reply pointer are both drawn when the header is collapsed for consecutive messages from one speaker, and a test fails if either is suppressed.
- AC3: A message's tag is identical whether it is drawn under an active participant filter or unfiltered, and a test fails if filtering changes which tags are drawn.
- AC4: `Transcript.matches()` finds a message by the text its reply pointer shows, and a test fails when text visible on screen is not searchable.
- AC5: `Transcript.toText()` and the pane produce the same pointer text, through one shared formatter; a test fails if the two disagree.
- AC6: The reply pointer introduces no non-ASCII glyph, and `test/client/wrap-defect.test.ts` is still the expected `test.failing` tripwire after the change.
- AC7: `bun run check` (lint, typecheck, full test suite) passes on the flow branch with no newly failing test and no skipped suite.
- AC8: `package.json` version is a patch bump over the released `0.7.1` and `CHANGELOG.md` records this change under it, with no MCP tool surface, CLI flag or log-format change.
