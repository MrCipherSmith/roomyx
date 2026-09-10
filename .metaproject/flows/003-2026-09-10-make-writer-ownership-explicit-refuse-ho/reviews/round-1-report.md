# Round 1 — flow 003 (writer ownership, D-18 items 1-4 and 7)

Review of the branch `keryx/003-writer-ownership` (PR #6) against D-18 in
`docs/roomyx/decisions.md`. The reviewer was read-only and could not run
anything, so every finding below is a **reading**; what settles each one is the
verification section, which ran.

## Coverage, stated before the findings

The reviewer read the new lease module, the CLI's ownership table, the batch
writer, `serve()`, and all four new/changed test files. It reported **four
findings at `major` and six at `minor`, plus two at `info`** — and the four
majors were all real: each one is a genuine way for two writers to append to one
log, which is the failure this flow exists to prevent. The two most dangerous
(R1-01, R1-02) were reproduced by mutation and are recorded as executed
verifications below.

This round did **not** cover: the read-side of D-18 (items 5 and 6, out of scope
for this flow by decision), the interaction with an embedder that constructs its
own `RoomState` (the field is optional by design, and no such embedder exists in
this repository), and Windows path semantics for the lease directory — reported
as unverified rather than assumed correct.

## Tally

- Findings in: 11 (4 major, 6 minor, 2 informational folded into R1-05 and R1-11).
- Acted on: 11. Blocker: 0 — the round did not hold the flow.
- The two executed refutations are the two that could actually produce two
  writers; the rest are site-checks, and are labelled as the weaker evidence
  they are.

```json keryx:findings
[
 {
  "id": "R1-01",
  "reviewer": "review-003",
  "severity": "major",
  "problem": "The writer lease was keyed by the registry path, so every room in a project shared one lease file. Two dispatch servers clobbered each other's lease, and `room append` to room B's log was refused by room A's fresh lease.",
  "impact": "A project runs several rooms at once \u2014 `serve` defaults to an ephemeral port precisely so it can \u2014 so the guard refused writes to logs nothing was writing, and two live dispatch servers each believed they had taken the other's lease.",
  "suggested_fix": "Key the lease by the log's absolute path, under a writers/ directory beside the registry.",
  "evidence": "test/writer-lease.test.ts: 'two rooms in one project get two leases'. Executed mutation: reverting to the registry-keyed name fails 7 of 9 lease cases.",
  "confidence": "high",
  "file": "src/writer-lease.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  },
  "class_scope": {
   "sites": [
    "src/writer-lease.ts:55",
    "src/cli.ts:335",
    "src/cli.ts:407"
   ],
   "enumeration_method": "`keryx ctx rg \"writerLeasePathFor\" src` returns one definition and exactly two derivation sites, both in src/cli.ts (room append, serve). `serve()` itself never derives it \u2014 it takes `writerLeasePath` as an option \u2014 so an embedder that passes a registry-keyed path reproduces the defect, which is why the option is named in the signature and documented rather than derived internally."
  }
 },
 {
  "id": "R1-02",
  "reviewer": "review-003",
  "severity": "major",
  "problem": "`--take-over` wrote no lease at all, so the displaced writer's heartbeat refreshed the lease it still held and revived it. Two processes could append to one log.",
  "impact": "The one case a lease exists to settle \u2014 who is writing now \u2014 was left unsettled by the act of taking it over, so the take-over did not actually transfer ownership.",
  "suggested_fix": "Replace the token on take-over and record who it displaced; the previous holder's refresh then fails, and the server reports that once and stops.",
  "evidence": "test/writer-lease.test.ts: 'a take-over replaces the token, so the previous holder cannot revive it'. Executed mutation: a take-over that reuses the on-disk token makes `refreshWriterLease` return true for the old holder and the case fails.",
  "confidence": "high",
  "file": "src/writer-lease.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  },
  "class_scope": {
   "sites": [
    "src/writer-lease.ts:118",
    "src/cli.ts:410",
    "src/server/serve.ts:65"
   ],
   "enumeration_method": "`keryx ctx rg \"acquireWriterLease\" src` returns one definition and exactly two call sites (cli.ts:410 for the take-over, serve.ts:65 for the server). The defect was in the function's choice of token, so both call sites could exhibit it; the fix is in the definition, so both are covered by the same test."
  }
 },
 {
  "id": "R1-03",
  "reviewer": "review-003",
  "severity": "major",
  "problem": "The lease was read only after the liveness probe succeeded, so a 500 ms probe timeout on a busy machine meant `serving` was undefined and the CLI wrote unconditionally into a room whose dispatcher was alive.",
  "impact": "The probe answers 'can I reach it', which is not 'nothing is writing into it'. Conflating them removed the guard exactly when the machine was loaded.",
  "suggested_fix": "Read the lease first and independently of the probe, and treat a room reporting a dispatcher as evidence in its own right.",
  "evidence": "src/cli.ts: readWriterLease is called before listLiveRooms' result is used, and `writerPresent` is `lease.held || dispatched === true`.",
  "confidence": "high",
  "file": "src/cli.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  },
  "class_scope": {
   "sites": [
    "src/cli.ts:338",
    "src/cli.ts:345",
    "src/cli.ts:346"
   ],
   "enumeration_method": "`keryx ctx rg \"readWriterLease|probeRoomState|listLiveRooms\" src` shows the only ownership decision in the codebase is cli.ts:338-346. listLiveRooms' other callers (cli.ts:480 `rooms list`, src/mcp-management/server.ts:48, src/installer/resolve-connection.ts:29) reach no write path, so none of them can reproduce it \u2014 verified by reading each rather than by the grep alone."
  }
 },
 {
  "id": "R1-04",
  "reviewer": "review-003",
  "severity": "major",
  "problem": "`room.get_state.dispatcherAttached` was produced and consumed nowhere: `serve()` acquired a lease only when BOTH `onOwnerCommand` and `writerLeasePath` were set, so a dispatching host that omitted the lease path gave `dispatcherAttached: true` with no lease, and the CLI wrote.",
  "impact": "The field was added so the CLI would stop inferring a writer; leaving it unread meant the inference was still the only guard for every embedder that does not manage a lease file.",
  "suggested_fix": "Make a room that reports a dispatcher refuse even with `--take-over`, since that room is not provably gone.",
  "evidence": "src/cli.ts: `dispatched === true` makes `writerPresent` true and the refusal names the reason; test/cli-room-ownership-e2e.test.ts exercises it against a real server holding a real lease.",
  "confidence": "high",
  "file": "src/cli.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  },
  "class_scope": {
   "sites": [
    "src/server/index.ts:59",
    "src/server/tools/get-state.ts:14",
    "src/log/types.ts:60",
    "src/installer/registry.ts:217",
    "src/cli.ts:346"
   ],
   "enumeration_method": "`keryx ctx rg \"dispatcherAttached\" src` returns 8 sites in 5 files: four that produce or type the field and exactly one that consumes it (cli.ts:346). Before the fix the consumer count was zero, which is the finding; publishing the whole list is what makes a future producer added without a consumer visible as a list that grew by one."
  }
 },
 {
  "id": "R1-05",
  "reviewer": "review-003",
  "severity": "minor",
  "problem": "The input paths were not mutually exclusive: `--from` beside `--json` was silently dropped, and the first attempt at a fix also refused `--body-file` with `--from`, which has no ambiguity in it.",
  "impact": "Silently preferring one source is how a body ends up in the log under a speaker nobody chose; over-refusing is a bug in the other direction and was caught by the test.",
  "suggested_fix": "Separate envelope sources (`--json`, `--many`) from body sources (`--body`, `--body-file`), and refuse a combination that is genuinely ambiguous.",
  "evidence": "src/cli.ts pendingAppends: `--json`/`--many` refuse a companion `--from`/`--body`/`--kind`; `--body-file` combines with `--from`, asserted by test/cli-room.test.ts.",
  "confidence": "high",
  "file": "src/cli.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  }
 },
 {
  "id": "R1-06",
  "reviewer": "review-003",
  "severity": "minor",
  "problem": "A branch throwing 'Refusing to append \u2026 without a stated reason. This is a bug: report it.' was unreachable from any real invocation.",
  "impact": "Dead code in a decision table is a claim about a state that cannot occur, and a later reader will maintain it as though it could.",
  "suggested_fix": "Remove it; the table's remaining branches each name a real state.",
  "evidence": "src/cli.ts: the string is absent (grep returns nothing).",
  "confidence": "high",
  "file": "src/cli.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  }
 },
 {
  "id": "R1-07",
  "reviewer": "review-003",
  "severity": "minor",
  "problem": "`--registry` was not resolved, so the lease path derived from it depended on the working directory the command happened to run in.",
  "impact": "A server started in one directory and a CLI run in another would use two different lease files, and each would believe it knew who was writing.",
  "suggested_fix": "Resolve the registry path before deriving the lease path.",
  "evidence": "src/cli.ts: `const absoluteRegistry = resolve(...)` feeds `writerLeasePathFor`; `serve` resolves it the same way.",
  "confidence": "high",
  "file": "src/cli.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  }
 },
 {
  "id": "R1-08",
  "reviewer": "review-003",
  "severity": "minor",
  "problem": "`close()` released the lease before the server stopped answering, leaving a window where a live room looked like it had no writer.",
  "impact": "The lease is the only thing saying 'someone is writing'; dropping it while the server still accepts calls invites a second writer during shutdown.",
  "suggested_fix": "Close the server first, then release the lease.",
  "evidence": "src/server/serve.ts: `await handle.close()` precedes `releaseWriterLease`.",
  "confidence": "high",
  "file": "src/cli.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  }
 },
 {
  "id": "R1-09",
  "reviewer": "review-003",
  "severity": "minor",
  "problem": "`acquireWriterLease` throwing after the port was bound leaked the transport: the server answered with no handle for its caller to close.",
  "impact": "A bind that cannot be followed by a lease leaves a live server nobody owns, which is the state the registry exists to make visible.",
  "suggested_fix": "Close the handle and rethrow when the lease cannot be written.",
  "evidence": "src/server/serve.ts: the acquire is wrapped, and the catch closes the handle before rethrowing.",
  "confidence": "high",
  "file": "src/cli.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  }
 },
 {
  "id": "R1-10",
  "reviewer": "review-003",
  "severity": "minor",
  "problem": "The heartbeat ignored `refreshWriterLease`'s return value, so a server that had lost its lease kept dispatching in silence.",
  "impact": "A take-over is exactly the moment the displaced writer must learn it is displaced, and the boolean was the only signal available.",
  "suggested_fix": "Report the loss once and stop the heartbeat rather than refreshing a lease this process no longer holds.",
  "evidence": "src/server/serve.ts: `if (!refreshWriterLease(...) && !complained)` writes to stderr once and clears the interval.",
  "confidence": "high",
  "file": "src/cli.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  }
 },
 {
  "id": "R1-11",
  "reviewer": "review-003",
  "severity": "minor",
  "problem": "`appendMessages`' all-or-nothing claim held for every failure it can observe, but not for an I/O failure partway through the appends \u2014 and nothing said so.",
  "impact": "'Atomic' with an unstated bound is a claim a later reader trusts; the batch is written in place because the log is append-only.",
  "suggested_fix": "State the bound on the function, and why the obvious fix (temp file + rename) is ruled out.",
  "evidence": "src/log/write.ts: the comment on appendMessages names the trigger and the reason a rename is not available.",
  "confidence": "high",
  "file": "src/log/write.ts",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 34e973b2620919fc711dfc75a76f9fce6fd4736a"
  }
 }
]
```

## Verifications — what an independent check found

The two `execution` verdicts were produced by reintroducing the defect the
finding names on the merged tree, running the suite, and reverting. The rest are
`site-check`: the code that would have to contain the defect no longer does, and
the check is written down so a later reader can repeat it.

```json keryx:verifications
{
 "status": "DONE",
 "verifier": "flow-orchestrator-mutation-pass",
 "summary": "11 findings; 2 proved and refuted by executed mutation, 9 refuted by site-check",
 "verifications": [
  {
   "finding": "__PKG__#R1-01",
   "verdict": "refuted",
   "method": "execution",
   "evidence": "Run against the tree at 34e973b2620919fc711dfc75a76f9fce6fd4736a with the defect reintroduced (a lease name derived from the registry path instead of the log): `bun test test/writer-lease.test.ts` failed 7 of 9, including 'two rooms in one project get two leases'. With the current code the same file is 9 pass / 0 fail. Reverted after the run."
  },
  {
   "finding": "__PKG__#R1-02",
   "verdict": "refuted",
   "method": "execution",
   "evidence": "Run against the tree at 34e973b2620919fc711dfc75a76f9fce6fd4736a with the defect reintroduced (a take-over reusing the token already on disk): 'a take-over replaces the token, so the previous holder cannot revive it' failed \u2014 `refreshWriterLease` returned true for the displaced holder, which is precisely the two-writer state. With the current code the case passes. Reverted after the run."
  },
  {
   "finding": "__PKG__#R1-03",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 34e973b2620919fc711dfc75a76f9fce6fd4736a: `readWriterLease` is called before `listLiveRooms`' result is consumed, and the decision input is `lease.held || dispatched === true`, so a failed probe can no longer mean 'no writer'."
  },
  {
   "finding": "__PKG__#R1-04",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 34e973b2620919fc711dfc75a76f9fce6fd4736a: `dispatched === true` is part of `writerPresent`, the refusal names the dispatcher reason, and the e2e case drives it against a real `serve()` holding a real lease."
  },
  {
   "finding": "__PKG__#R1-05",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 34e973b2620919fc711dfc75a76f9fce6fd4736a: `pendingAppends` separates envelope from body sources and refuses the ambiguous combination; the `--body-file` + `--from` case is asserted in test/cli-room.test.ts and passes."
  },
  {
   "finding": "__PKG__#R1-06",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 34e973b2620919fc711dfc75a76f9fce6fd4736a: the 'This is a bug: report it' string is absent from src/cli.ts."
  },
  {
   "finding": "__PKG__#R1-07",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 34e973b2620919fc711dfc75a76f9fce6fd4736a: `resolve()` is applied to the registry path in both `room append` and `serve` before `writerLeasePathFor`."
  },
  {
   "finding": "__PKG__#R1-08",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 34e973b2620919fc711dfc75a76f9fce6fd4736a: in the composable handle `await handle.close()` precedes `releaseWriterLease`."
  },
  {
   "finding": "__PKG__#R1-09",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 34e973b2620919fc711dfc75a76f9fce6fd4736a: `acquireWriterLease` is wrapped, and the catch closes the transport handle before rethrowing."
  },
  {
   "finding": "__PKG__#R1-10",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 34e973b2620919fc711dfc75a76f9fce6fd4736a: the heartbeat checks `refreshWriterLease`'s return and reports the loss once before clearing itself."
  },
  {
   "finding": "__PKG__#R1-11",
   "verdict": "refuted",
   "method": "site-check",
   "evidence": "Checked at 34e973b2620919fc711dfc75a76f9fce6fd4736a: appendMessages carries the bound and the reason a temp-file-and-rename is not available."
  }
 ],
 "stats": {
  "confirmed": 0,
  "refuted": 11,
  "unverifiable": 0,
  "not_checked": 0
 }
}
```
