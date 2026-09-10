Implements **D-17** (`docs/roomyx/decisions.md`) and closes the reply-pointer section of the improvement backlog. Version **0.7.2** - rendering only, no MCP tool surface, CLI flag or room-log format change (D-13).

## The defect

The transcript drew a reply target as a raw sequence number: `answer  re #4`. Nothing in the client ever resolved that number to a speaker - not the pane, not the `w` export. In `docs/roomyx/screenshots/review-room.jsonl` (nine messages, four participants) **four messages reply and two of them answer the same message**, so two rows rendered as identical, unresolvable tags. `@Name` appears zero times in any body, which is why highlight-on-mention was rejected.

Two related defects sat in the same two lines:

- The tag was drawn **inside the header**, and the header is suppressed for consecutive turns by one speaker - so a second turn lost its kind and its pointer. Because the run was computed over the visible list, filtering a participant could also *hide* a tag that was present unfiltered.
- The tag was assembled **twice** (row + export) while the search haystack saw neither, so `/` could not find text that was on screen.

## The change

- One formatter, `messageTag`, used by the pane, `matches()` and `toText()`.
- The pointer is the **parent author's resolved name** plus a short quote: `answer  -> Ines "..."`. Unresolved (`in_reply_to` naming a `seq` not in the log) draws nothing rather than half a tag.
- ASCII only: `->` and `...`, not the ambiguous-width arrows and ellipsis, which shift the wrapped row.
- `ChatView` resolves the parent through a `seq` map before recording the message, so the pointer is known when the row is built and rendering stays incremental - no drawn row is ever amended.

## Evidence

- TDD: 8 tests red before the fix, 12/12 green after.
- The verification step runs against the **real room log**, not a fixture: `test/client/reply-pointer-real-log.test.ts` asserts no rendered row contains `re #`, that all four pointers name the right author (`-> Paul`, `-> Paul`, `-> Ines`, `-> Ken`), and that `/` finds each reply by the pointer it shows.
- `bun run check`: 338 tests, 337 pass. The one failure, `cli serve lifecycle > records an absolute logPath`, is **pre-existing on `main`** - verified by stashing and re-running (`/var` vs `/private/var` on macOS).
- `test/client/wrap-defect.test.ts` is untouched and still the designed `test.failing` tripwire. The diff does not change body width or wrapping.
- Health gate: PASS, project score 98.

## Review

Two reviewers dispatched; the regression round returned four minor findings, all fixed in the second commit (a vacuous assertion, a coverage gap on the new tag renderable, a misplaced comment, dead export). The correctness round exhausted its round budget without producing findings and is recorded as unusable rather than counted as a pass - see the flow journal.

Flow: `002` - `.metaproject/flows/002-2026-09-10-render-reply-addressing-readably-and-sto/`
