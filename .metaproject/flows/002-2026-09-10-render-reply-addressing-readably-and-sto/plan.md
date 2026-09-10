# Implementation Plan

Status: ready to freeze.

## Approach

One formatter, one place the row is built, and the tag drawn outside the
header's suppression.

The three defects in the description are one defect wearing three hats: the
reply pointer is assembled ad hoc, at the one call site that can be switched
off. So the change is structural rather than cosmetic — a single exported
function that turns an envelope plus a resolved parent name into the pointer
text, used by the pane, the search haystack and the export, and drawn by
`createMessageRow` regardless of whether the header is shown.

Naming needs the roster, which the row does not currently have. Two shapes were
available: pass a resolver into `createMessageRow`, or resolve in `ChatView` and
hand the row a finished string. The second is chosen: `ChatView` already holds
`rosterById` (it resolves `fromName` there today), so the row stays a pure
presentation unit and the resolver stays testable without a renderer.

The quote (D-17 item 2) is included because it is what makes the pointer
readable in this room: four of nine messages answer something that is not the
message above them. It is clipped to a fixed cell budget with an ASCII ellipsis
and never wraps, so it cannot introduce a new wrap boundary.

## Steps

1. **Failing tests first** (`test/client/message-row.test.ts`,
   `test/client/transcript.test.ts`) — assert the pointer names the parent
   author, that it survives a collapsed header, that `/` finds it, and that
   `toText()` prints what the pane shows. Run them red before any production
   edit.
2. Add the single formatter (parent author + clipped quote) next to the row
   component; delete the inline copy in `transcript.ts` and the local `tagFor`.
3. Move the tag out of the `showHeader` branch in `createMessageRow`; keep the
   header itself suppressed, since collapsing repeated speaker names is a
   shipped decision (`tui-review.md`, ranked 3).
4. Widen the search haystack in `matches()` to include the pointer text, and
   make `toText()` use the formatter.
5. `bun run check` (lint + typecheck + test), including the wrap-defect tripwire
   still failing and nothing newly failing.
6. Docs: CHANGELOG entry under a patch version, `package.json` bumped.

## Risks

- **Row width.** The tag grows from `answer  re #4` to `answer  -> Inés: "…"`.
  Measured against `test/client/wrap-defect.test.ts`: a longer header line could
  shift where a wrapped body line breaks. Mitigated by clipping the quote to a
  fixed budget and keeping the header a single non-wrapping line.
- **Tag set changes under a filter.** Fixing defect 2 by drawing the tag outside
  `startsRun` removes the filter-dependence; a test must pin that the same
  message shows the same tag filtered and unfiltered.
- **Incremental rendering.** `appendEntry` only appends; nothing re-renders a
  drawn row. The change keeps that (the pointer is known when the row is built,
  and the parent is always an earlier `seq`), so `rebuild()` /
  `destroyRecursively()` paths are untouched.
- **Unverifiable by reading alone.** The backlog section was written from code,
  not from running. Step 1 exists to convert every claim into an executed
  assertion before the fix, so the flow does not ship a fix for a
  not-yet-reproduced defect.
