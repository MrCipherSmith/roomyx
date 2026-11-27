# Plan

## Approach

Four waves, ordered so that the cheap confirmed defects land before the two
changes that touch a protocol. Tests first in every wave: each defect in this
flow was *reproduced* by the audit, so a test that fails on the current code can
be written before the fix, and a test that does not fail first is not evidence.

- **Wave A — the five P0 defects.** Lease, `seq` ceiling, lock deadline,
  owner-queue leak, shutdown exit. All local, all confirmed, none touching a
  wire format.
- **Wave B — the security items.** Symlink refusal, MCP config validation,
  `limit: 0`, `SECURITY.md`, and the per-room token with its decision record.
- **Wave C — the measured performance work.** One change closing four things:
  the open backlog item, the read ceiling, the O(n²) append, and the
  liveness-probe starvation.
- **Wave D — the small verified wins, review, and documentation.**

## Trade-offs taken deliberately

**The lease symptom is fixed here; its root cause is not.** The audit's P4
proposes moving the single-writer decision out of `cli.ts` into a `canWrite`
verdict the core requires. That is the right fix and it is out of scope for a
defect flow: it changes where an invariant lives, which is a decision, not a
repair. This flow removes the foot-gun — a one-shot writer stops holding a lease
nothing releases — and leaves a journal note pointing at the structural work.
Fixing a symptom while naming the cause is honest; fixing it while implying the
cause is gone would not be.

**The per-room token is the largest item and it amends a recorded decision.**
D-06 chose no token in v1 with a stated argument. The audit does not overturn
that argument — it shows the argument does not reach the owner-command queue,
which converts read access into instruction access to an agent holding tools.
So the change ships as an amendment, D-06b, written the way D-06a was: what
changed in the threat model, what the token does cover, and what it plainly does
not. The token is not authentication of a person; it bounds which local
processes can drive the room, and the record must say so rather than claim more.

**`Math.max(...seqs)` is replaced as hygiene, not as risk.** The concurrency
pass reported a `RangeError` above ~125,000 messages; the logic pass measured
Bun's actual spread limit near 1,000,000 and declined to report it. The
construct is real (`write.ts:77`, `store.ts:148`); the threshold claim was
wrong. `reduce` costs nothing and removes the question.

**The cache is keyed on `(mtimeMs, size)`, not on a watcher.** A watcher is more
correct and much more to own: it needs teardown on every path that opens a log,
and this project already paid for one leak class it could not see. `mtime`
granularity can in principle miss a same-millisecond rewrite; the log is
append-only and size therefore changes on every append, which is why size is in
the key. Stated here rather than discovered later.

## Verification strategy

Each wave ends in its own verification task, not a sentence in this file — the
`tasks` gate is on for this flow (`gates.tasks: true`), so a verification step
that is not a task keeps the flow open instead of being quietly dropped.

The performance claim is the one that cannot be verified by a passing test
alone: AC13 requires a recorded before/after measurement in `journal.md`, taken
with the same synthetic-room benchmark the audit used, so the number is
reproducible rather than asserted.

## Risks

- **The token touches four call sites** (`RoomClient`, `callRoomTool`,
  `probeRoomState`, the liveness probe). A miss shows up as a room that reports
  `unknown` liveness rather than as a test failure, which is exactly the
  silent-degradation shape D-06a warned about for `allowedHosts`. The
  verification task for Wave B therefore drives a real `serve` + client + probe
  round trip, not only unit tests.
- **Caching a parse changes what every reader sees.** If invalidation is wrong,
  a client shows a stale transcript and nothing fails loudly. The test for AC13
  asserts both halves: unchanged file is not re-read, *and* a changed file is.
- **`soak.ts` in CI can flake.** It is bounded and its budget is set low
  deliberately; if it proves noisy, the answer is a scheduled workflow rather
  than deleting the only automatic guard against the class of defect this
  project has shipped three times.
