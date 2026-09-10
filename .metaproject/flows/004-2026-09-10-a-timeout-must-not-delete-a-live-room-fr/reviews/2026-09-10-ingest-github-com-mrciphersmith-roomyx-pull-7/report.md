# Round 1 - flow 004 (R7's timeout half)

Review of branch `keryx/004-liveness-timeout` (PR #7) against item **R7** in
`docs/roomyx/improvement-backlog.md`.

## Coverage, stated before the findings

**The independent reviewer produced nothing usable.** It exhausted its round
budget and returned only its opening line - the second time in this project
(flow 002's correctness reviewer did the same). That is recorded as **an unusable
round, not a clean one**, and it is why this round's findings are written by the
flow's own author. A self-review is weaker evidence than an independent one, and
is labelled as such here rather than presented as a review.

What the author checked directly, by reading and by running:

- every path in `checkRoomLiveness`, asking whether a live room can be classified
  `gone` (it cannot: `gone` requires a non-running pid, or a server that answered
  and named a different `log_path`);
- all five consumers of liveness (`resolve-connection`, `mcp-management`,
  `rooms list`, `room append`, tests) for behaviour that changed unintentionally;
- the accumulation question for the unconfirmed set;
- the `rooms list` output as a human sees it, including the empty-registry case.

One real defect in this branch's own code came out of that. Two further
observations are recorded below and deliberately **not** filed as findings,
because filing them would force a disposition decision an orchestrator is not
entitled to make - the mistake flow 003's round made with its `R1-04`.

## Tally

- Findings in: 1 (minor). Blocker/major: 0 - the round did not hold the flow.
- Observations recorded, not filed: 2.
- Coverage gap: no independent reader; see above.

```json keryx:findings
[
 {
  "id": "R1-01",
  "reviewer": "review-author-004",
  "severity": "minor",
  "file": "src/installer/registry.ts",
  "problem": "The append guard looked for the room serving the log only in the confirmed-live list, so a room whose first probe timed out was invisible to it, and the second probe that would have told it whether a dispatcher is attached was never made. On a loaded machine, 'is anyone writing into this log?' came back 'nothing is'.",
  "impact": "It is the same collapsed question this change exists to stop asking, one level up: the probe's load-sensitivity was allowed to decide a question about a writer. Narrower than it looks - the writer lease covers the CLI's own path, so the exposure is an embedder that supplies onOwnerCommand but no lease path.",
  "suggested_fix": "Search both lists, because the caller needs to know which room this is, not whether it may attach to it.",
  "evidence": "src/installer/registry.ts findRoomServing; src/cli.ts uses it. Executed mutation: narrowing the lookup back to the confirmed list alone makes the new test fail with undefined.",
  "confidence": "high",
  "class_scope": {
   "sites": [
    "src/cli.ts:341",
    "src/installer/registry.ts:findRoomServing"
   ],
   "enumeration_method": "rg for listLiveRooms|listRoomsWithLiveness in src returns five call sites; only cli.ts:341 needs the room for its identity rather than for an attach decision. The other four either want confirmed-live only or already use the two-list form."
  },
  "disposition": {
   "state": "acted-on",
   "evidence": "commit a421ab08bd5664147878d7c0d74c51133562370e"
  }
 }
]
```

## Observations recorded rather than filed

1. **An entry with `pid: 0` is never pruned.** `isPidAlive` returns `true` for a
   non-positive pid ("no pid recorded - fall back to the probe"), so such an entry
   that never answers stays in the unconfirmed set with no bound. Ordinary use
   cannot produce it - `registerRoom` always writes the real pid - so it takes a
   hand-edited registry. Named because "never pruned" is deliberate here and this
   is the one shape where it has no ceiling.
2. **An append probes twice.** `listRoomsWithLiveness` probes every registered
   room, then the guard probes the matching entry again for `dispatcherAttached`.
   Pre-existing (it arrived with D-18's dispatcher evidence), and this flow made
   the second probe reachable for unconfirmed entries as well. Folding the flag
   into the liveness probe's own result would remove it, and would belatedly
   justify extracting `probeRoomState` in the first place.

## Verifications - what an independent check found

One, executed, and it is the one that matters: the fix for the round's only
finding was verified by reintroducing the defect and watching the test fail.

```json keryx:verifications
{
 "status": "DONE",
 "verifier": "flow-orchestrator-mutation-pass",
 "summary": "1 finding; proved and refuted by executed mutation against the branch head",
 "verifications": [
  {
   "finding": "__PKG__#R1-01",
   "verdict": "refuted",
   "method": "execution",
   "evidence": "Run against the tree at a421ab08bd5664147878d7c0d74c51133562370e: narrowed findRoomServing back to the confirmed list alone and ran bun test test/installer/registry-liveness.test.ts -t 'an unconfirmed entry is still found' - the test failed with Expected: r-bv75p7 / Received: undefined. With the fix in place the same file is 14 pass / 0 fail. Reverted after the run."
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
