# Round 1 — flow 002 (reply addressing, D-17)

Review of `git diff main...HEAD -- src test` on branch `keryx/002-reply-addressing`
(PR #4): five files in `src`/`test`, +277/-16. Two reviewers were dispatched in
parallel over the same diff — one for correctness of the new behaviour, one for
regression and blast radius. Both were read-only and could not run anything, so
every finding below is a **reading**, and each carries the evidence of what was
done about it.

## Coverage, stated before the findings

**The correctness reviewer produced no findings.** It exhausted its round budget
before reporting and returned only its opening line. That is recorded here as an
**unusable round, not a clean one** — zero findings and no review are different
facts, and this project keeps them apart elsewhere. Correctness of the pointer
resolution, the search haystack and the clipping is therefore **unreviewed by an
independent reader** in this round. What stands behind it is the test suite,
including the real-log verification, and nothing more.

The regression reviewer covered, by reading: the wrap-defect tripwire, renderable
lifetime, the assertions that were rewritten, every consumer of `Transcript` and
`MessageEntry`, and the palette and comment standards. It reported four findings,
all `minor`, all acted on.

## Tally

- Findings in: 4. Acted on: 4 (three required code or test changes, one was a
  confirmation recorded because it looks like a defect and is not).
- Blocker/major: 0. The round did not hold the flow.
- Coverage gap stated above: the correctness half did not report.

```json keryx:findings
[
 {
  "id": "R1-01",
  "reviewer": "review-regression",
  "severity": "minor",
  "problem": "The 'no stray tag' claim was tested only by expect(replyOnly).not.toContain(\"#7\"), which cannot fail while the formatter contains no '#'. It is a guard against a revert, not a live check, and it never tested what its test name claimed: that an unresolved reply leaves a clean, name-only header.",
  "impact": "An assertion that cannot fail is coverage by appearance. If a future change drew a partial or stray tag for an unresolved reply, this test would still pass.",
  "suggested_fix": "Assert the unresolved-reply header positively, keeping the negative only as a revert guard.",
  "evidence": "test/client/message-row.test.ts — the reply-to-missing case. Fixed by asserting header.trim() === \"Ann\".",
  "confidence": "high",
  "file": "test/client/message-row.test.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 1dd7581"
  }
 },
 {
  "id": "R1-02",
  "reviewer": "review-regression",
  "severity": "minor",
  "problem": "renderable-lifetime.test.ts builds sixty messages with no kind and no in_reply_to, so it never allocates a tag renderable and never takes the collapsed-header branch that draws one on its own line.",
  "impact": "The new child renderable — the one this change introduced — is not covered by the test whose whole subject is renderable lifetime. A leak specific to tagged rows would pass it.",
  "suggested_fix": "Add a second case with tagged, replying messages toggled through a filter, asserting the registry does not grow.",
  "evidence": "test/client/renderable-lifetime.test.ts — the case 'filtering back and forth does not accumulate tag rows either' now passes with 60 tagged messages, and would fail if the tag row were allocated outside the row box.",
  "confidence": "high",
  "file": "test/client/renderable-lifetime.test.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 1dd7581"
  }
 },
 {
  "id": "R1-03",
  "reviewer": "review-regression",
  "severity": "minor",
  "problem": "The 'one place the tag is spelled' rationale sat on the QUOTE_CELLS constant rather than on messageTag, and QUOTE_CELLS was exported with no consumer.",
  "impact": "A reader of the public API gets the function's rationale attached to the wrong symbol, and an exported constant with no consumer is dead surface in a module that is already imported by three consumers.",
  "suggested_fix": "Move the comment onto messageTag and make QUOTE_CELLS private.",
  "evidence": "src/client/transcript.ts — grep for QUOTE_CELLS returns only its declaration and its use inside quote().",
  "confidence": "high",
  "file": "src/client/transcript.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 1dd7581"
  }
 },
 {
  "id": "R1-04",
  "reviewer": "review-regression",
  "severity": "minor",
  "problem": "matches() now also matches the quoted parent text, so a phrase appearing in a parent's first 24 characters matches every row that replies to it.",
  "impact": "Match counts widen beyond exactly 'the pointer the pane shows'. This is the mechanism by which the pointer becomes searchable at all, so it is required rather than unfortunate.",
  "suggested_fix": "No code change. Recorded so a later reader does not file the widening as a defect.",
  "evidence": "AC4 requires the pointer to be findable; the real-log test asserts two rows match '-> Paul', which is the widening working as intended.",
  "confidence": "high",
  "file": "src/client/transcript.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "confirmation, no code change required — this is AC4's mechanism"
  }
 }
]
```

## Verified clean, by construction

- **The wrap-defect tripwire is untouched.** The tripwire's message carries no
  `kind` and no `in_reply_to`, so `messageTag` returns `""` and the row builds no
  tag renderable at all — the new branch is reached only by messages that have a
  tag. Body width and wrapping are governed by the body renderable, which the
  diff does not touch. It cannot start passing and cannot fail a new way.
- **No renderable leak.** The tag line is a child of the row box, not an entry in
  `ChatView.rows`, so `rebuild()`'s `destroyRecursively()` frees it with its
  parent; `rows.length` still equals `visible().length`, so entry indexing is
  unaffected. `messagesBySeq` is bounded by the transcript it mirrors.
- **No production consumer is left without a resolved parent.** `ChatView.appendMessages`
  is the only place `MessageEntry` values are built in `src/`; read-only mode
  (`--open`, `--archive`) sets the roster before appending, so names resolve.
- **Standards.** No duplicated formatter remains (`tagFor` deleted), the tag still
  uses the existing `TAG_FG`, and no meaning was moved into colour.
