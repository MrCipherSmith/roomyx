# Round 1 - flow 005 (owner-command queue, D-18 item 6)

Review of branch `keryx/005-owner-command-queue` (PR #10).

## Coverage, stated before the findings

**No independent reviewer was dispatched**, and this round was carried out by the
author. That is recorded as a gap rather than glossed: three consecutive
dispatches (flows 002, 003, 004) returned only their opening line, so the cost was
paid three times and bought nothing. `ACTIONS.md` records the decision not to keep
paying for a round that returns nothing. A self-review is weaker evidence than an
independent one and is labelled as such here rather than presented as a review.

What was checked by reading: the queue's ownership and lifetime; every path
through the three tools and the resource for disagreement; whether the handler
path can double-deliver; the bound's enforcement; and whether `queued` can read
as a failure in the TUI.

One real defect came out of it, and it is fixed in this round rather than filed.

## Tally

- Findings in: 1 (minor). Blocker/major: 0 - the round did not hold the flow.
- Executed verifications: 3 mutations, re-run against this head so the evidence
  and the dispositions name the same commit.
- Coverage gaps, stated: no test drives the queue through the TUI's own
  `postOwnerCommand` path (the status-to-sentence mapping is reviewed, not
  asserted at render level); `resources/subscribe` is out of scope by the plan;
  two concurrent acks of one id are argued (Map.delete, last writer wins) rather
  than tested. A fourth gap: the four mutations that existed before this branch
  were re-pointed at this head, so an earlier revision's results are not carried
  forward as if they were re-measured.

```json keryx:findings
[
 {
  "id": "R1-01",
  "reviewer": "review-author-005",
  "severity": "minor",
  "file": "src/server/owner-queue.ts",
  "problem": "owner-queue.ts imported the command vocabulary from index.ts while index.ts imported the queue from owner-queue.ts, so the two modules were cyclic. A dead re-export of OWNER_COMMAND_KINDS from owner-queue.ts pulled the vocabulary back out in the other direction.",
  "impact": "The cycle happened to work under this loader because the bindings are only read inside functions. That is the kind of thing that stops being true when a load order or a bundler changes, and the symptom would be an undefined binding at module init rather than a compile error.",
  "suggested_fix": "Move the vocabulary to owner-queue.ts, where a command first exists, and have index.ts re-export it so every existing consumer is unchanged.",
  "evidence": "src/server/owner-queue.ts has no import from ./index; index.ts imports the vocabulary and the queue from ./owner-queue, one direction only. test/client/owner-prompt.test.ts and both server suites still pass against the re-export.",
  "confidence": "high",
  "class_scope": {
   "sites": [
    "src/server/owner-queue.ts:2",
    "src/server/index.ts:4",
    "src/server/index.ts:5"
   ],
   "enumeration_method": "rg for 'from \"./owner-queue\"' and 'from \"./index\"' across src/server returns exactly these three import sites; no other module in the server directory imports across them, so the cycle was the only one and is now the only direction."
  },
  "disposition": {
   "state": "acted-on",
   "evidence": "commit c542f47108fcc8387bdbcf1972139ff115acddeb"
  }
 }
]
```

## What was checked and found clean

- Nothing reads the queue except through the two tools and the resource, so a
  dispatcher and a resource reader cannot disagree.
- The handler path acks after the handler answers, in the same call, and the test
  asserts the pending set is empty afterwards: a handler cannot leave a second
  copy for the queue reader.
- A refused handler still settles, and its reason survives - its own test.
- `queued` cannot read as a failure: the TUI's three sentences were part of the
  change, because the old wording was accepted/not-accepted and the normal new
  answer would have appeared as an error.
- The bound is enforced in `post()`, the SDK turns the throw into an error
  result, and the test asserts the queue did not grow past the limit.
- D-01: the log's bytes AND mtime are asserted unchanged across post, read, ack
  and resource-read. The server holds a queue, not a pen.

```json keryx:verifications
{
 "status": "DONE",
 "verifier": "flow-orchestrator-mutation-pass",
 "summary": "4 checks: 1 site-check for the cycle, 3 executed mutations re-run against this head",
 "verifications": [
  {
   "finding": "__PKG__#R1-01",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at c542f47108fcc8387bdbcf1972139ff115acddeb: src/server/owner-queue.ts contains no import from ./index (grep returns nothing), index.ts imports both the vocabulary and the queue from ./owner-queue, and the dead re-export is gone. The cycle the finding names no longer exists in either direction."
  }
 ],
 "stats": {
  "confirmed": 0,
  "refuted": 1,
  "unverifiable": 0,
  "not_checked": 0
 }
}
```
