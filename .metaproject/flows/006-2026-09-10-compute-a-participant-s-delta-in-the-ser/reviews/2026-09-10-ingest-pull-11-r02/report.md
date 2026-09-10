# Round 1 - flow 006 (participant delta, D-18 item 5)

Review of branch `keryx/006-delta-for-agent` (PR #11).

## Coverage, stated before the findings

**No independent reviewer was dispatched**, and the round was carried out by the
author. That is a gap, not a formality: four consecutive dispatches across flows
002-005 returned only their opening line, so the cost was paid four times and
bought nothing, and `ACTIONS.md` records the decision to stop paying it. A
self-review is weaker evidence than an independent one and is labelled as such.

What was checked by reading, beyond the tests:

- whether a second implementation of the delta already existed anywhere;
- whether the answer's shape lets a caller mistake "nothing is new" for "I read
  the wrong cursor";
- what an empty delta actually looks like on the wire;
- whether validation is missing anywhere it matters.

One real finding came out of it and is fixed in this round.

## Tally

- Findings in: 1 (minor). Blocker/major: 0 — the round did not hold the flow.
- Executed verifications: 4 mutations, re-run against this head so the evidence
  and the disposition name the same commit.
- Coverage gaps, stated: no independent reader; `since_seq` validation lives in
  the MCP schema only, so a direct caller of the store function can pass a
  negative cursor (it degrades to "everything", which is what a negative cursor
  means, and no test asserts it); and nothing measures the cost of the full
  `loadRoomLog` parse this tool now pays, which is R10's unmeasured other half.

```json keryx:findings
[
 {
  "id": "R1-01",
  "reviewer": "review-author-006",
  "severity": "minor",
  "file": "src/log/store.ts",
  "problem": "The rule for a participant's own last seq was computed twice \u2014 once in get_agent_detail for lastSeenSeq, and once in the new getAgentDelta for its default cursor.",
  "impact": "It is a rule, not an expression: it is the convention both tools publish about what a participant has seen. Two copies mean a change to it must be made twice, and until someone notices, the two answers disagree silently \u2014 each looks plausible on its own, and nothing compares them.",
  "suggested_fix": "One helper, lastOwnSeq(messages, agentId), used by both.",
  "evidence": "grep for the expression in src/log/store.ts returns one occurrence, inside lastOwnSeq, with two call sites (getAgentDetail line 114, getAgentDelta line 150).",
  "confidence": "high",
  "class_scope": {
   "sites": [
    "src/log/store.ts:97",
    "src/log/store.ts:114",
    "src/log/store.ts:150"
   ],
   "enumeration_method": "rg for 'max of own' / 'Math.max(...own' across src returns the single helper and its two consumers; no other module computes an agent's own-last-seq, so the convention now has exactly one implementation."
  },
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 0aff0aa25a9e197eea6e26f806ee44c030e3a83c"
  }
 }
]
```

## What was checked and found clean

- **No second implementation of a delta exists.** A grep for the concept finds
  this tool and prose, nothing else — so the convention has one implementation
  after the finding above.
- **An empty delta is distinguishable from a not-found participant.** `zara`'s
  answer is `{found: true, messages: [], since_seq: 4, cursor_from:
  "agent-last-message"}` and an unknown id is `{found: false}` with no `messages`
  key at all.
- **The wire description is asserted where a client can read it.** The check
  lives in `test/server/serve.test.ts`, not in the tool's own unit test, because
  a string assertion against the source cannot see what the wire says.
- **Its own messages are excluded independently of the cursor.** With
  `since_seq: 0` that is the only rule doing work, and it has its own test.
- **The log is untouched.** The existing "no tool writes the room log" test now
  covers this tool: bytes and mtime unchanged.

```json keryx:verifications
{
 "status": "DONE",
 "verifier": "flow-orchestrator-mutation-pass",
 "summary": "5 checks: 4 executed mutations against this head, 1 site-check for the shared rule",
 "verifications": [
  {
   "finding": "__PKG__#R1-01",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 0aff0aa25a9e197eea6e26f806ee44c030e3a83c: 'Math.max(...own.map' appears once in src/log/store.ts, inside lastOwnSeq, and both getAgentDetail and getAgentDelta call it. The duplication the finding names is gone, and no third copy exists."
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
