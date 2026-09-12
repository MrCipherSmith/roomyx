# Executive Summary: roomyx 0.4.0 defect remediation

Job `gproject-roomyx-backlog` · read this instead of the other eight documents.

Fifteen defects, already reproduced against published 0.4.0 and ranked by a
five-participant room, were planned — not re-derived — into **15 stories, 34
tasks, 3 milestones, 7 release tags**. Everything below is decided. There are no
open questions and no placeholders.

---

## Start here

**Remove `targetPath` from the `roomyx.skills.sync` MCP tool.** It is a live,
unauthenticated, arbitrary-path write reachable over the network transport, and
removing it is minutes of work: delete the field from `inputSchema`, drop its
handling at `mcp-management/server.ts:62–74`, fix
`test/mcp-management/server.test.ts:81`, edit `README:168`. Its own commit, so it
is revert-proof.

That is the whole reason 0.5.0 exists as a release and not as a chapter of a
bigger one. Everything else in this plan can wait a week; this cannot.

---

## Build order is the queue. The ranked five is a weighting.

Both orderings are real inputs and both survive in the artifacts, so it is worth
saying once, unmissably:

| | Sequence |
|---|---|
| **Build order — this is the work queue** | S1 · S2 · S4 → R3 → R4 → R8 → R2 → R1 · (R5 residual last) |
| **Ranked five — a weighting, never a schedule** | R1, R2, R8, R4, R5 |

The failure this exists to prevent is concrete: an implementer who reads the
ranked five as a queue opens with a three-day render rewrite, for rooms they have
no supported way to create. R3 is position zero by sequence and outside the
ranked five entirely — it was excluded for a gating reason (it needs an owner's
amendment to D-01), not a value reason; its own value score is 10/10.

---

## The three milestones

### 0.5.0 — the loopback door closes

Ships: **S1** (`targetPath` removal) + the **transport extraction** +
**S2** (DNS-rebinding guard with the SDK floor at `>=1.25.0`) + **S4**
(`--frozen-lockfile` in `release.yml`) + the **D-06 and D-07 records** +
**`CHANGELOG.md`** + the **release gate**.

The release gate lands here on `--version`: `release.yml:91` drops `|| true` and
asserts exit 0 and that the printed version equals the tag. The `--help`
assertion is added in 0.6.0, once R8 makes `--help` exit 0 — it exits 1 today,
and that is half of R8. This overrode the planner's proposal to defer the whole
gate; the part that is already possible is executed now rather than postponed
whole.

A minor, not a patch, because removing a field from the network tool breaks MCP
embedders, and under 0.x a breaking change belongs in the minor position.

*Demo at the end*: the room's own 400-POST cross-origin reproduction returns
0/400 accepted (was 400/400), the attacker-path write no longer lands on disk,
and roomyx's own `Origin`-less client still completes the handshake at 200.
**5.5 h — 9 h — 18 h.**

### 0.6.0 — the CLI becomes learnable and gets an on-ramp

Ships **R3 → R4 → R8**, in that order. R3 is gated on the D-01 amendment. R3
absorbs `src/cli/seed.ts`, so R8 then unifies two flag parsers rather than three
— the reverse order means unifying a file that disappears immediately after.

*Demo*: a clean machine runs the README top to bottom — install → `room new` →
`serve` — with no `npm root -g` anywhere, and the six measured CLI lines behave
as documented against a packed tarball. **15 h — 25 h — 50 h.**

### The patch stream — five tags, two of them cut before 0.6.0

| Tag | Contents |
|---|---|
| v0.5.1 | the seq-1 fix — a one-message room draws its one message |
| v0.5.2 | S3 — `roomyx init` stops eating hand edits |
| v0.6.1 | R2 — honest errors; reported state equals actual state (+ R9's ordering half) |
| v0.6.2 | R1's render half — wrapping, `kind`, reply markers, empty-vs-error, scroll keys |
| v0.6.3 | R5 residual — the session reaper |

0.5.1 and 0.5.2 are cut *before* 0.6.0 development finishes. Neither waits on
anything in M2, and the one hour that makes every room's first message exist must
not queue behind a two-day parser. None of these changes a published surface a
minor would exist to announce.

---

## What it costs

**≈ 7 days — ≈ 9.5 days — ≈ 15 days** of single-operator work. Sizes are the
backlog's, verbatim; the bands are presentation (×0.6 / ×2), not a re-estimate.

The critical path is `D-01 amendment → R3 → R8 → release gate → audit → tag`,
≈ 20.75 h. **R8 is both the longest task (~16 h) and the largest scheduling
risk** — the 0.6.0 tag queues entirely behind it. The largest *correctness* risk
is the transport extraction: it is behaviour-preserving by construction and
self-checking (seven existing suites must pass with zero edits), so being wrong
about it is cheap to detect — but being wrong about it silently is exactly how a
security fix ships in one of two duplicated files, on an immutable
provenance-signed tarball.

---

## Every ruling, and why

**On the security surface.** The SDK floor is `>=1.25.0` — measured, not guessed:
the guard first exists at 1.13.3, `Origin` becomes lenient at 1.24.0, option
forwarding begins at 1.25.0, and 1.25.0 is the only range where the tested path
equals the shipped path. `>=1.13.3` was rejected outright because pre-1.24.0
rejects requests carrying no `Origin` header — roomyx's own TUI client and
`isRoomLive()` send none, so the naive "where the guard first exists" answer
would make the product 403 itself. The guard stops browsers, not local processes,
and must never be described as authentication. Allowlists are built lazily from
the bound port inside `createSession()`, and both `allowedHosts` and
`allowedOrigins` are required — a port-less `allowedHosts` 403s roomyx's own
client, and the two defend different attacks. `--frozen-lockfile` must not ship
*after* the floor raise: a raised floor is meaningless while the release job
resolves freely under `--provenance`, which would attest a tree nobody tested.

**On structure.** Extract the shared HTTP transport once, first, in its own
commit — measured: the two bodies differ in five hunks, seven test files
construct these servers and zero import internals, so an extraction preserving
the `serve()`/`serveManagement()` signatures edits no tests. D-07 is recorded in
`docs/roomyx/decisions.md` inside that same commit, because a structural decision
outlives the PR that made it.

**On the UI.** `PgUp`/`PgDn`/`Home`/`End` scroll the transcript; `↑`/`↓` stay with
the roster; `scroll` stays private. `Home`/`End` replace the backlog's
`Ctrl-U`/`Ctrl-D` because the library implements all four ruled keys natively
while half-pages would need hand-rolled delta arithmetic — recorded so it does not
read as silent scope loss. R1's scroll half was re-priced down, the single
permitted exception to "do not re-estimate", invoked on measured evidence: the
seq-1 bug is the horizontal scrollbar eating one viewport row, not the
sticky-bottom model, and `stickyScroll` suspend/resume was verified already
correct by rendering. No scroll state machine gets written.

**On test criteria.** The session leak is proven by the session map, not by RSS —
a leak is by nature an entry that was not removed, and a map size is a binary
predicate where RSS on a GC runtime gives false results in both directions. The
reaper is explicit termination *plus* a server-side idle sweep, because
`terminateSession()` alone only fixes well-behaved clients and the item exists
because of the ones that never say goodbye. N = 200 with three assertions —
200 for continuity with the harness that recorded +18 MB / 200 cycles, and the
third assertion exists specifically so a counter that never increments cannot
pass vacuously.

**On the release.** 0.5.0 first, then 0.6.0: a fast 0.4.1 was formally wrong, and
one combined release would hold the security hole hostage to the longest work.
`CHANGELOG.md` gets created — generated notes answer "what changed" but not "why"
or "what to do if you depended on this", and 0.5.0 is precisely a release that
breaks something for embedders. R3 before R8. The release gate as above. The
planner's five decisions were ratified as proposed — N=200 with three assertions,
the patch-stream contents, G6 dated at v0.6.3, PKG-8 raised from `SHOULD` to MUST
(a criterion cannot be discretionary in one artifact and a hard checkbox in the
next), and the estimate bands treated as presentation. Commits land on `main`
split by meaning — the room's output, the documentation package, the walkthrough
correction — not as one blob. Implementation is authorised to begin with
milestone 0.5.0 in full.

**On process.** Sizes and scope were fixed inputs; the pipeline planned the
room's findings rather than re-deriving them. Two acts are the owner's and must
not be dispatched to an implementer agent: the D-01 amendment and the D-06
amendment carried inside S2's commit. Owner, implementer and approver are the
same person here, so nothing organisational enforces that gate — it exists only
as a blocking definition-of-done.

---

## What is still uncertain

Three things, honestly:

1. **Two test-observation channels are sketched, not proven.** Nothing in `test/`
   today can count `runClient()` invocations through a launcher (needed to prove
   `import.meta.main` stays false on the `await import()` path), and nothing can
   observe "zero network calls" from the launcher. Both mechanisms are designed —
   an env-gated marker asserted from a `Bun.spawn` subprocess, and a stripped
   `PATH` plus a local listener that records connection attempts — and both are
   carried unpriced. If either needs a second design pass, that is the realistic
   scenario, not the pessimistic one.

2. **R1's render half carries a ceiling, not an estimate.** The backlog priced R1
   whole at ~3 days and never priced the remainder after the scroll half was
   split out. This plan carries the full 3 days as a ceiling and declines to
   invent a smaller number, while expecting it to come in under — a priced
   sub-task (the scroll state machine) was deleted from it outright.

3. **The install base is unknown, and the compatibility judgement rests on it.**
   There is no download data. "Removing a field from the network tool breaks MCP
   embedders, therefore minor not patch, therefore a CHANGELOG entry naming the
   migration target, therefore no shim and no deprecation cycle" is a chain built
   on a medium-confidence assumption about who is out there. It is the right call
   under uncertainty, but it is a call, not a measurement.

---

## What the pipeline caught in itself

This is the part worth remembering in three months, because it is the reason to
trust the rest. Four claims were wrong, and all four were caught before any of
them reached code.

- **The retracted SDK claim.** An intermediate correction recorded that the SDK's
  DNS-rebinding guard does not reach the transport roomyx constructs — read from
  a grep miss and mistaken for an absence. It was wrong: the guard *is* a
  forwarded constructor option, verified by reading the installed 1.30.0 and
  probing six tarballs. The wrong row (`D_sdk_guard_superseded`) is still in the
  registry, struck through and marked, with its correction
  (`D_sdk_guard_reaches`) beside it. Had it stood, S2 would have been a
  hand-rolled reimplementation of code already shipping.

- **The stale read that propagated.** That same retracted claim was still being
  asserted in the source-of-truth backlog, 250 lines after its own corrections
  section retracted it — under the R5 heading, which is exactly where an
  implementer picking up the session-reaper work opens the file. Every downstream
  artifact had quietly got it right and none of them said the input was wrong.
  Found by checking artifacts against the current state of what they cite, and
  fixed in place.

- **A constraint that guarded a property which does not exist.** Three artifacts
  told the R4 implementer that `import.meta.dir` is used in `src/client/index.ts`
  and must keep resolving. It appears nowhere in that file. The property a
  launcher actually breaks is `import.meta.main` — a launcher that `import()`s
  the module instead of `exec`ing leaves it false and `runClient()` never fires,
  producing a binary that exits 0 and does nothing. Traced to a compression
  truncation two phases upstream, from a line that was originally correct.

- **A reference implementation that is not in the file.** Several artifacts sent
  the S3 implementer to "follow what `init.ts:40` already does" with `syncSkill()`.
  `init.ts` imports no `syncSkill`; line 40 is a closing brace. The instruction
  pointed at the very work S3 is. The real reference lives in a different module.

None of these was found by re-reading the documents. All four were found by
executing or reading claims against the tree — 118 checks, seventy-four of them
against the live repo and its dependencies. The one critical still open at the
Phase-5 gate (the unbounded leak criterion) was closed by ruling rather than by
argument, and the fix changed the observable rather than the number.

---

<!-- Document Metadata -->
| Key | Value |
|-----|-------|
| Created | 2026-09-09 |
| Agent | job-documenter |
| Task | Executive summary closing the gproject documentation pipeline |
| Job | gproject-roomyx-backlog |
| Version | 1.0 |
| Status | final |
