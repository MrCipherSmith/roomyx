# Round 1 — flow 002 (reply addressing, D-17)

Review of `git diff main...HEAD -- src test` on branch
`keryx/002-reply-addressing` (PR #4). Two reviewers dispatched in parallel over
the same diff: one for correctness of the new behaviour, one for regression and
blast radius. Both were read-only and could not run anything — so every finding
below is a **reading**, and its disposition says what was done about it.

## Coverage, stated before the findings

**The correctness reviewer produced no findings.** It exhausted its round budget
before reporting and returned only its opening line. That is recorded here as an
**unusable round, not a clean one** — the distinction this project keeps making
elsewhere (zero findings and no review are different facts). The correctness of
the pointer resolution, the search haystack and the clipping is therefore
**unreviewed by an independent reader** in this round; what stands behind it is
the test suite, including the real-log verification, and nothing more.

What the regression reviewer did cover, verified by reading rather than running:
the wrap-defect tripwire, renderable lifetime, the rewritten assertions, every
consumer of `Transcript`/`MessageEntry`, and the palette/comment standards.

## Findings — four, all `minor`, all acted on

| id | Severity | What | Disposition |
| --- | --- | --- | --- |
| R1-01 | minor | `expect(replyOnly).not.toContain("#7")` cannot fail while the formatter contains no `#` — a guard against a revert, not a live check — and it never tested what its test name claimed ("neither leaves a stray tag behind"). | acted-on — commit 1dd7581: the unresolved-reply header is asserted positively (`header.trim() === "Ann"`); the negative is kept only as a revert guard. |
| R1-02 | minor | `renderable-lifetime.test.ts` builds sixty messages with no `kind` and no `in_reply_to`, so it never allocates a tag renderable and never takes the collapsed-header branch that draws one on its own line. A leak specific to tagged rows would have passed it. | acted-on — commit 1dd7581: a second case with sixty tagged, replying messages toggled through a filter. |
| R1-03 | minor | The "one place the tag is spelled" rationale sat on the `QUOTE_CELLS` constant rather than on `messageTag`, and `QUOTE_CELLS` was exported with no consumer. | acted-on — commit 1dd7581: the comment moved onto the function and the constant is private. |
| R1-04 | minor | Pre-existing, inherited rather than introduced: `matches()` now also matches the quoted parent text, so a phrase in a parent's first 24 characters matches every row that replies to it. | intended — this is AC4, and it is the mechanism by which the pointer becomes searchable at all. Recorded so a later reader does not file it as a defect. |

## Verified clean, by construction

- **The wrap-defect tripwire is untouched.** The tripwire's message carries no
  `kind` and no `in_reply_to`, so `messageTag` returns `""` and the row builds
  no tag renderable at all — the new branch is reached only by messages that
  have a tag. Body width and wrapping are governed by the body renderable, which
  the diff does not touch. It cannot start passing and cannot fail a new way.
- **No renderable leak.** The tag line is a child of the row box, not an entry
  in `ChatView.rows`, so `rebuild()`'s `destroyRecursively()` frees it with its
  parent; `rows.length` still equals `visible().length`, so entry indexing is
  unaffected. `messagesBySeq` is bounded by the transcript it mirrors.
- **No production consumer is left without a resolved parent.** `ChatView.appendMessages`
  is the only place `MessageEntry` values are built in `src/`; read-only mode
  (`--open`, `--archive`) sets the roster before appending, so names resolve.
- **Standards.** No duplicated formatter remains (`tagFor` deleted), the tag
  still uses the existing `TAG_FG`, and no meaning was moved into colour.
