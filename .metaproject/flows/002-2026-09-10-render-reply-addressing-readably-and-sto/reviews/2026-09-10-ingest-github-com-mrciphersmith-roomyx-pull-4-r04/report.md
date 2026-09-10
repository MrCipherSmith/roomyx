# Round 1 — flow 002 (reply addressing, D-17)

Review of `git diff main...HEAD -- src test` on branch `keryx/002-reply-addressing`
(PR #4): five files in `src`/`test`, +277/-16. Two reviewers were dispatched in
parallel over the same diff — one for correctness of the new behaviour, one for
regression and blast radius. Both were read-only and could not run anything, so
every finding below is a **reading**; what settles each one is the verification
section at the end, which ran.

## Coverage, stated before the findings

**The correctness reviewer produced no findings.** It exhausted its round budget
before reporting and returned only its opening line. That is recorded here as an
**unusable round, not a clean one** — zero findings and no review are different
facts, and this project keeps them apart elsewhere. Correctness of the pointer
resolution, the search haystack and the clipping is therefore **unreviewed by an
independent reader** in this round. What stands behind it is the test suite,
including the real-log verification, and nothing more.

The second reviewer was dispatched with a **regression lens** over the computed
blast radius (12 files, hop 1-2: `src/client/viewer.ts`, `scripts/replay.ts`,
`scripts/soak.ts`, `src/client/index.ts` and the client test suite). Its
regression lens produced **no scope-B finding**: nothing in the dependent set
breaks at `major` or above. The tripwire's non-interaction is established by
construction — its message carries no tag, so the new branch is never reached.

Three findings were raised about **the change itself** (scope A), all `minor`,
all acted on and all re-checked below. A fourth observation — that `matches()`
now also matches the quoted parent text — is **not filed as a finding**: it is
required behaviour, measured by the real-log test, and filing it forced a
disposition decision that is not the orchestrator's to make. It is recorded here
instead: AC4 requires the pointer to be findable, and this widening is the
mechanism. A reviewer who later sees it should not file it as a defect.

## Tally

- Findings raised: 3. All `minor`, all acted on, all refuted post-fix by
  executed mutation (see below). Blocker/major: 0 — the round did not hold the flow.
- Coverage gap stated above: the correctness half did not report.

```json keryx:findings
[
 {
  "id": "R1-01",
  "reviewer": "review-client-change",
  "severity": "minor",
  "problem": "The 'no stray tag' claim was tested only by expect(replyOnly).not.toContain(\"#7\"), which cannot fail while the formatter contains no '#'. It is a guard against a revert, not a live check, and it never tested what its test name claimed: that an unresolved reply leaves a clean, name-only header.",
  "impact": "An assertion that cannot fail is coverage by appearance. A change that drew a partial or stray tag for an unresolved reply would still pass it.",
  "suggested_fix": "Assert the unresolved-reply header positively, keeping the negative only as a revert guard.",
  "evidence": "test/client/message-row.test.ts — the reply-to-missing case. The old assertion passes against a mutant that emits '-> undefined'; the new one does not.",
  "confidence": "high",
  "file": "test/client/message-row.test.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 30bfacbb203c43b34f8eba6b7083a2caa5500775 (landed in main as PR #4)"
  }
 },
 {
  "id": "R1-02",
  "reviewer": "review-client-change",
  "severity": "minor",
  "problem": "renderable-lifetime.test.ts builds sixty messages with no kind and no in_reply_to, so it never allocates a tag renderable and never takes the collapsed-header branch that draws one on its own line.",
  "impact": "The new child renderable — the one this change introduces — is not covered by the test whose whole subject is renderable lifetime. A leak specific to tagged rows passes it.",
  "suggested_fix": "Add a case with tagged, replying messages toggled through a filter, asserting the registry does not grow.",
  "evidence": "test/client/renderable-lifetime.test.ts — with the leak mutant the new case fails (758 renderables against a bound of 218) while the pre-existing case passes.",
  "confidence": "high",
  "file": "test/client/renderable-lifetime.test.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 30bfacbb203c43b34f8eba6b7083a2caa5500775 (landed in main as PR #4)"
  }
 },
 {
  "id": "R1-03",
  "reviewer": "review-client-change",
  "severity": "minor",
  "problem": "The 'one place the tag is spelled' rationale sat on the QUOTE_CELLS constant rather than on messageTag, and QUOTE_CELLS was exported with no consumer.",
  "impact": "A reader of the public API gets the function's rationale attached to the wrong symbol, and an exported constant with no consumer is dead surface in a module three consumers import.",
  "suggested_fix": "Move the comment onto messageTag and make QUOTE_CELLS private.",
  "evidence": "src/client/transcript.ts — grep for QUOTE_CELLS returns its declaration and its use inside quote() only.",
  "confidence": "high",
  "file": "src/client/transcript.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 30bfacbb203c43b34f8eba6b7083a2caa5500775 (landed in main as PR #4)"
  }
 }
]
```

## Verifications — what an independent check found

Not a re-reading. Each verdict below was settled by **temporarily reintroducing
the defect the finding describes**, running the suite, and reverting. A finding
is `refuted` when the code as it now stands contradicts it — which for a fixed
finding is exactly what "it stopped reproducing" means, shown by executing
rather than by asserting.

| Finding | Defect reintroduced | Result on the current code |
| --- | --- | --- |
| R1-01 | `messageTag` made to emit `-> undefined` for an unresolved reply | the new positive assertion **fails** (11 pass / 1 fail); reverted → 12/12. The old `not.toContain('#7')` passes under the same mutant, which is the finding. |
| R1-02 | a tag-only renderable added to the scroll box instead of the row box | the new lifetime case **fails**, registry 758 against ≤218; reverted → 4/4. The pre-existing case passes under the same mutant. |
| R1-03 | none possible — placement and visibility are not behaviour | `grep -n QUOTE_CELLS src/client/transcript.ts` returns the declaration and its use in `quote()`; the rationale block sits on `messageTag`. |

Source reverted after every mutation: `git status --short -- src/` is clean and
the client suite is 16/16 green afterwards.

```json keryx:verifications
{
  "status": "DONE",
  "verifier": "flow-orchestrator-mutation-pass",
  "summary": "3 findings, all re-checked after the fix: 2 by executed mutation, 1 by site-check",
  "verifications": [
    {
      "finding": "2026-09-10-ingest-github-com-mrciphersmith-roomyx-pull-4-r04#R1-01",
      "verdict": "refuted",
      "method": "execution",
      "evidence": "Run against the tree at 30bfacbb203c43b34f8eba6b7083a2caa5500775 (main, after PR #4 merged), with the defect the finding names reintroduced (messageTag emitting '-> undefined' when the parent is unresolved). Ran bun test test/client/message-row.test.ts: the case 'either field alone renders, and neither leaves a stray tag behind' failed, 11 pass / 1 fail. Reverted: 12 pass / 0 fail. The assertion is now load-bearing, so the finding no longer describes this code."
    },
    {
      "finding": "2026-09-10-ingest-github-com-mrciphersmith-roomyx-pull-4-r04#R1-02",
      "verdict": "refuted",
      "method": "execution",
      "evidence": "Run against the tree at 30bfacbb203c43b34f8eba6b7083a2caa5500775 (main, after PR #4 merged), with the leak the finding names reintroduced (a tag-only TextRenderable added to the scroll box rather than the row box). Ran bun test test/client/renderable-lifetime.test.ts: 'filtering back and forth does not accumulate tag rows either' failed with 758 renderables against a bound of 218, while the pre-existing case passed under the same mutant. Reverted: 4 pass / 0 fail. The coverage gap is closed."
    },
    {
      "finding": "2026-09-10-ingest-github-com-mrciphersmith-roomyx-pull-4-r04#R1-03",
      "verdict": "refuted",
      "method": "site-check",
      "evidence": "Checked at 30bfacbb203c43b34f8eba6b7083a2caa5500775 (main, after PR #4 merged): grep -n 'QUOTE_CELLS' src/client/transcript.ts returns the declaration and its use inside quote(), with no external consumer; the rationale block is now on messageTag. The two symbols the finding named no longer have the stated shape."
    }
  ],
  "stats": { "confirmed": 0, "refuted": 3, "unverifiable": 0, "not_checked": 0 }
}
```
