# Round 1 - flow 007 (folding state edits, D-19)

Review of branch `keryx/007-fold-state-edits` (PR #12).

## Coverage, stated before the findings

**No independent reviewer was dispatched**, and the round was the author's. Four
consecutive dispatches (flows 002-005) returned only their opening line, and
`ACTIONS.md` records the decision to raise the budget before paying for another.
A self-review is weaker evidence than an independent one and is labelled as such.

What the round did, beyond the suite:

- walked both write paths and both read paths for disagreement;
- asked which of the two write implementations the product actually uses, which
  is what found the defect below;
- re-read the decision it implements against the code that shipped, which found
  that **D-19 as first written described something the format could not do** (see
  the note after the tally);
- checked that the fold cannot write, that the header is never reinterpreted, and
  that a log with no edits is unaffected.

## Tally

- Findings in: 2 (one major, one minor, the second being the cause of the first).
  Blocker: 0 - the round did not hold the flow.
- Executed verifications: five mutations, of which four fail their named test and
  one is a **control** that must not.
- Coverage gaps: no independent reader; the CLI's `--json` path is tested but the
  `change` payload's *content* is only shape-checked, so a semantically absurd
  edit (a threshold below its own fail mark) is accepted by design and untested;
  and `archiveRoom`'s divergence is recorded rather than covered.

```json keryx:findings
[
 {
  "id": "R1-01",
  "reviewer": "review-author-007",
  "severity": "major",
  "file": "src/log/write.ts",
  "problem": "The single-append path (`appendMessage` + `writeMessage`) assembled the message envelope itself and dropped the `change` field. An edit appended one message at a time was therefore written as a valid message that was not an edit: accepted by the schema, and never applied by the fold.",
  "impact": "Silent state loss. A dispatcher posting a goal edit as a single message would get a successful write, a message visible in the transcript tagged `goal_edit`, and a room whose state never changed. The failure is invisible from both ends: the writer reports success and the reader reports the old contract, which looks exactly like an edit that was never sent.",
  "suggested_fix": "One implementation. `appendMessage` delegates to `appendMessages`; `writeMessage` is deleted.",
  "evidence": "After the fix, dropping `change` from the single builder fails two cases in test/log/fold.test.ts ('a change of the wrong type for its kind is refused by the writer', 'a change on an ordinary message is refused too'). Before the fix, the same mutation failed nothing in test/cli-room.test.ts \u2014 because the CLI goes through the batch path, so no test in the product's own path could see it.",
  "confidence": "high",
  "class_scope": {
   "sites": [
    "src/log/write.ts:116",
    "src/log/write.ts:134"
   ],
   "enumeration_method": "rg for 'appendMessage(' in src returns the definition and no call site; rg for 'appendMessages(' returns the CLI's writeAll. So after the fix there is exactly one envelope builder (buildMessage) reached by one write implementation, and the enumeration is the whole set rather than a sample."
  },
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 9308168fc321921906f7a383e0cbc395807f47d8"
  }
 },
 {
  "id": "R1-02",
  "reviewer": "review-author-007",
  "severity": "minor",
  "file": "src/log/write.ts",
  "problem": "`appendMessage` had no caller in src at all: the CLI's write path goes through `appendMessages`. A second implementation existed, was exported, was tested, and was not used by the product.",
  "impact": "It is the cause of R1-01 rather than a separate defect, and it is why the drift survived: a path no product code exercises is a path whose bugs no product test can catch. Two implementations of one contract is the shape `src/log/schema.ts` exists to prevent on the reader's side.",
  "suggested_fix": "Delegate, as in R1-01 \u2014 recorded separately because the mutation evidence differs: R1-01 is proven by a behaviour change, R1-02 by the grep that showed nobody called it.",
  "evidence": "rg 'appendMessage\\(' src returns only its own definition; rg 'appendMessages\\(' src returns src/cli.ts:183.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 9308168fc321921906f7a383e0cbc395807f47d8"
  }
 }
]
```

## The decision was wrong, not just the code

D-19 as first written said an invalid change "does not break reading". That
contradicts the format's strictest rule: an ill-formed line makes a room unreadable
forever, and there is no repair command. The tests found the contradiction before
the implementation did.

The amended decision states the boundary as it works, and this is the part worth
keeping: **shape belongs to the schema, application belongs to the fold.** A
`change` whose `type` does not match its kind is refused by the writer; a
`goal_edit` with no `change` is a valid message that simply is not an edit, and
the fold skips it. Making the second ill-formed would have invented a new way for a
log to die - which is the one thing this format cannot afford.

## The mutations, and the control

| Mutation | Result |
|---|---|
| fold order reversed (last edit no longer wins) | `two edits fold in seq order` **FAILED** |
| roster replaced instead of grown | `an add_participant grows the roster` **FAILED** |
| `updated_by` not filled | `a goal_edit changes what get_state reports` **FAILED** |
| single builder drops `change` | two cases in `fold.test.ts` **FAILED** |
| **control:** the base contract is copied rather than aliased | **passed, as expected** |

The control is deliberate: it shows the assertions are about content rather than
object identity, so a passing suite is not an accident of how the fold happens to
share references.

```json keryx:verifications
{
 "status": "DONE",
 "verifier": "flow-orchestrator-mutation-pass",
 "summary": "5 executed mutations against this head, plus one control that must NOT fail",
 "verifications": [
  {
   "finding": "__PKG__#R1-01",
   "verdict": "refuted",
   "method": "execution",
   "evidence": "Run against the tree at 9308168fc321921906f7a383e0cbc395807f47d8: dropped `change` from the single envelope builder and ran test/log/fold.test.ts - two cases failed (the mismatched-change and ordinary-message refusals). Reverted; 11 pass / 0 fail."
  },
  {
   "finding": "__PKG__#R1-02",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 9308168fc321921906f7a383e0cbc395807f47d8: rg 'appendMessage\\(' src returns the definition only, and appendMessage now delegates to appendMessages, which is what cli.ts:183 calls. There is one implementation, so the second path the finding names no longer exists."
  }
 ],
 "stats": {
  "confirmed": 0,
  "refuted": 2,
  "unverifiable": 0,
  "not_checked": 0
 }
}
```
