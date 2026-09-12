# Consistency Report: roomyx 0.4.0 defect remediation

Job: `gproject-roomyx-backlog` · Phase 5 · mode `task_in_project`
Method: every load-bearing claim was **executed or read against the tree**, never
grepped-and-inferred. Six SDK tarballs were downloaded and probed. Nothing in
`/home/altsay/roomyx` was modified.

> `metaproject: unavailable` — `.metaproject/` exists but contains only `data/`;
> there is no `index.md`. Carried forward from Phase 0 and re-verified here.

## Verdict: FAIL — revised to **PASS_WITH_WARNINGS** after the Phase-5 patch round

## Summary
- Checks executed: 118, plus 12 re-verifications in the patch round
- CRITICAL violations: **4 found → 3 RESOLVED, 1 open (V-003, with the owner)**
- WARNING violations: **9 found → 1 RESOLVED (W-007), 8 open**
- INFO items: **5 (+2 from the patch round, I-006/I-007 below)**

### Patch round (re-verified, not re-run in full)
- **V-001 RESOLVED.** The two-row table is carried **verbatim** in PKG-3 and
  `prd.md:571–572`; seam H and A10 updated. No artifact asserts `import.meta.dir`
  in `client/index.ts`. A10's new claim checked and **TRUE**: `cli.ts:189–190` is
  `else if (command === "client") { const { runClient } = await import("./client/index"); }`,
  so a re-execing launcher would enter `runClient()` twice.
- **V-002 RESOLVED.** FS-1, seam G and US-007 now state that `init.ts` does not
  import `skill-sync`, that S3 *introduces* the edge, and that
  *"follow the existing pattern in `init.ts`"* is itself an FS-1 violation.
- **V-004 RESOLVED.** `improvement-backlog.md:319–321` rewritten. Swept the whole
  file: the only other hits are `:66` (inside the corrections, narrating the
  retraction) and `:332` (states the guard correctly). No contradiction remains.
- **W-007 RESOLVED.** Rationale present at A6, UI-4, US-013 AC and the PRD's
  Technical Foundation. Reads as a reasoned substitution, not scope loss.
- **V-003 STILL_OPEN** by design — N and tolerance are with the owner.
- **I-006** — US-007 cites the `existsSync` guards as `init.ts:36–41`; they run
  `:36`–`:43`. Directionally right, off by two.
- **I-007** — A6/UI-4/US-013 attribute the `Ctrl-U`/`Ctrl-D` criterion to **R11**;
  it stands today at `improvement-backlog.md:162` under **R1** (R11 was retired
  into R1). Provenance is defensible; the live location differs.
- Owner rulings checked for survival: **8/8 survive intact everywhere they are referenced**

---

## What was verified by execution (and passed)

Recorded because a clean check is only worth anything if it names what it ran.

| Claim | Where asserted | Verification | Result |
|---|---|---|---|
| Guard is a forwarded constructor option, not absent | `D_sdk_guard_reaches`, P6, C3, SEC-11, A3 | read installed 1.30.0: `streamableHttp.js:52` = `new WebStandardStreamableHTTPServerTransport(options)`; `.d.ts:20` type alias; guard read at `webStandardStreamableHttp.js:77–79`, enforced `:139–162` → 403 / `-32000` | **TRUE** |
| T1 guard first enforced at **1.13.3** | `stack-decision.md:429` | fetched 1.13.2 + 1.13.3 tarballs: 0 vs 2 matches for `enableDnsRebindingProtection` | **TRUE** |
| T2 Origin becomes lenient at **1.24.0** | `stack-decision.md:430` | 1.23.1 = `if (!originHeader \|\| !allowed.includes(...))`; 1.24.0 = `if (originHeader && !allowed.includes(...))` | **TRUE** |
| T3 forwarding begins at **1.25.0** | `stack-decision.md:431` | 1.24.3 = guard inline, no forwarding; 1.25.0 = forwarding, guard moved to web-standard | **TRUE** |
| ⇒ floor `>=1.25.0` is the only range where tested path == shipped path | `D_sdk_floor_ruling` (OWNER) | follows from T1–T3 measured above | **TRUE** |
| Origin-less local caller passes the lenient check | `D_guard_scope`, SEC-9 | the `originHeader &&` short-circuit, read in 1.30.0 | **TRUE** |
| Port-less `allowedHosts` 403s roomyx's own client | SEC-4, A2 (OWNER) | `this._allowedHosts.includes(hostHeader)` — exact match on the full `Host` incl. port | **TRUE** |
| Transport bodies differ in 5 hunks, 1 pure whitespace, 4 real | `architecture.md:150–158` | ran `diff` on `serve.ts:35–102` vs `mcp-management/server.ts:107–175` | **TRUE, exactly** |
| 7 test files construct these servers; **0** import internals | TR-2, TR-7, TEST-10, A1 | grep both ways over `test/` | **TRUE** |
| `README:18 / :36 / :42 / :82 / :168 / :183–196` | REL-4, G9, US-015, FS-1 | read each line | **all TRUE** |
| Both registers' `D-01` at `:7`, different meanings; no `D-07` yet | DEC-2, DEC-3 | read both files in full | **TRUE** |
| roomyx `D-02` is the "no second home-grown command/file channel" referent | FS-5 | read D-02's rejected alternative | **TRUE** |
| `ci.yml:16` frozen / `release.yml:53` bare / `:91` `\|\| true` / no `workflow_dispatch` | REL-1/2/3, SEC-2, Q3 | read both workflows | **TRUE** |
| ~30 further line anchors (`cli.ts:20–36,47,72,85–91,158,174`; `client/index.ts:12–22,120–121`; `seed.ts:17–27`; `mcp-client.ts:56,113–118`; `registry.ts:126–130,229`; `skill-sync.ts:78,83–86`; `chat-view.ts:20,36,40`; `message-row.ts` `height:1`; `status-bar.ts:40`; `test/mcp-management/server.test.ts:81`) | passim | read each | **all TRUE** |

**Owner rulings, checked at every reference site:** sdk floor `>=1.25.0` (7 sites);
extract the transport once, first (TR-1/2/3, A1, US-003, API-surface table);
D-07 into `docs/roomyx/decisions.md` (DEC-3, §7, US-003); PgUp/PgDn/Home/End with
arrows left on the roster (UI-3/4, A6, US-013); R1's re-price carried **with** the
horizontal-scrollbar root cause (SCOPE-2, UI-2, A5, §5.7, US-012); allowlists built
lazily from the bound port (SEC-4, A2, US-005); `--frozen-lockfile` not shipping
after the floor raise (SEC-2, REL-3, US-005 *Depends on*, US-006); R9's split
(`D_r9_ride_along`, NG1, SCOPE-3, US-011 two ACs — one requiring the ordering fix,
one forbidding the drain half). **All eight survive intact. None is contradicted
anywhere.**

`D_sdk_guard_superseded` contradicting `D_sdk_guard_reaches` is correct behaviour
for an append-only registry and is **not** counted as a violation.

---

## Violations

### CRITICAL

#### V-001: `import.meta.dir` is not used in `src/client/index.ts` — the claim is false
- **Check**: Best Practices ↔ code (stated fact about the code)
- **Found in**: `tech-bestpractices.md` **PKG-3**; `architecture.md` §1.3 seam H;
  `prd.md` US-009 AC2 — all three state *"`import.meta.dir` is used at
  `cli.ts:47,174` and `client/index.ts:132` and must keep resolving."*
- **Measured**: `grep -n "import.meta" src/client/index.ts` returns **one** match:
  `132:if (import.meta.main) {`. There is **no `import.meta.dir` anywhere in that
  file.** `cli.ts:47,174` are correct.
- **Where it came from**: `stack-decision.md` C2 states it **correctly** —
  *"`import.meta.dir` / `import.meta.main` are used at `cli.ts:47,174` and
  `client/index.ts:132`."* Phase 3 dropped `import.meta.main` from the pair and
  Phase 4 inherited the truncation.
- **Why it matters, not pedantry**: the constraint's whole job is to tell the R4
  implementer what the `roomyx-client` launcher must not break. What it must not
  break there is **`import.meta.main`** — a launcher that `import()`s the module
  instead of `exec`ing bun on it leaves `import.meta.main` false and
  `runClient()` never fires, producing a binary that exits 0 and does nothing.
  As written the constraint protects a property that does not exist and is silent
  on the one that does. PKG-4's launcher test covers only `cli.ts`'s `--version`.
- **Suggested fix**: restore C2's wording in PKG-3, seam H and US-009 AC2, and add
  an AC asserting `roomyx-client` actually starts through the launcher.
- **Fix target**: Phase 3 (`tech-bestpractices.md`, `architecture.md`) → Phase 4 (`prd.md`).

#### V-002: `init.ts:40` does not route through `syncSkill()` — nothing in `init.ts` does
- **Check**: Best Practices ↔ code (stated fact about the code)
- **Found in**: `tech-bestpractices.md` **FS-1** (*"matching `:40`'s existing
  behaviour"*); `problem-statement.md` **G7** (*"routes through `syncSkill` …
  exactly as lines 40 already do"*); `prd.md` US-007 AC1 (*"routes through
  `syncSkill()` — backup, hash record, warnings — matching what line `:40`
  already does"*).
- **Measured**: `src/installer/init.ts` is 47 lines and **imports no `syncSkill`**
  (`import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync }
  from "node:fs"` is the only value import besides `join`). Line 40 is the closing
  brace of `if (!existsSync(configPath)) { … }`. No call site in that file has the
  behaviour US-007 tells the implementer to copy.
- **Where it came from**: the backlog (S3, `:55`) states it **correctly** — *"The
  same function guards `config.json` and `registry.json` with `existsSync` four
  lines earlier."* That is a statement about `existsSync` care, not about
  `syncSkill`. Phase 1 compressed it into "routes through `syncSkill` as :40 does"
  and Phases 3 and 4 inherited it.
- **Why it matters**: US-007's first AC points an implementer at a reference
  implementation inside the same file that is not there. The real reference is
  `skill-sync.ts:46–100`, in a different module.
- **Suggested fix**: restate as *"route `:44` through `syncSkill()` from
  `installer/skill-sync.ts`; `:38–42` show the existsSync-guard care the
  unconditional `copyFileSync` at `:44` skips."*
- **Fix target**: Phase 1 (`problem-statement.md` G7) → Phase 3 (FS-1) → Phase 4 (US-007).

#### V-003: US-014's first acceptance criterion cannot be satisfied as written — no N, no tolerance
- **Check**: Internal consistency / criterion satisfiability. **Confirms flagged gap 2.**
- **Found in**: `prd.md` US-014 AC1 — *"RSS returns to baseline after **N**
  legitimate connect/close cycles."* Also `prd.md` G6 row, §Security Requirements 1.
- **Traced upstream**: `problem-statement.md:310` and `:490` carry the same
  unbound `N`. The backlog (`:324`) is the origin: *"RSS returns to baseline after
  N connect/close cycles from a legitimate client."* **`N` is never bound and no
  tolerance is ever stated in any artifact.** The only numbers anywhere are the
  observation `+18 MB per 200 cycles` and `~102 KB` per request.
- **Why it matters**: "returns to baseline" over an unspecified count with no
  tolerance has no pass/fail boundary. RSS never returns *exactly* to baseline in
  a real process. An implementer cannot write this test, and a reviewer cannot
  reject a wrong one. This is the only AC in the PRD with no observable predicate.
- **Blocks**: US-014 (P1) — and therefore G6, whose target is the **binary** *"all
  five sub-criteria"* (see W-009).
- **Suggested fix**: owner binds N and a tolerance — the recorded harness gives a
  defensible pair, e.g. *"200 cycles on the harness that recorded +18 MB; RSS
  within 2 MB of the pre-loop reading, sampled after an explicit GC."*
- **Fix target**: owner ruling at the Phase 5 gate, then Phase 4 (US-014).

#### V-004: the source of truth still carries the claim its own corrections section retracts
- **Check**: Artifacts ↔ current state of what they cite (`D_source_of_truth`)
- **Found in**: `docs/roomyx/improvement-backlog.md:319–321`, R5's body:
  *"The guard ships as S2 — see the corrections there, **including the fact that
  the SDK does not provide it for this transport**, and that the D-06 amendment
  belongs in S2's commit."*
- **Conflicts with**: the same file's own *"Corrections to S2"* at `:63–75` —
  *"The room was right and an intermediate correction was wrong — the guard **is**
  a constructor option"* — and with `D_sdk_guard_reaches`, C3, SEC-11 and ruling A3.
- **Verified**: the guard **does** reach the transport roomyx constructs. Read in
  the installed 1.30.0 and confirmed across six probed tarballs (table above). The
  retracted claim is false.
- **Why it is CRITICAL and not cosmetic**: `D_source_of_truth` makes this file the
  input the pipeline plans against, and R5 is the section an implementer opens
  when they pick up US-014. The corrections live 250 lines earlier under an **S2**
  heading; the reader who navigates by finding-id never sees them. This is
  precisely the failure the pipeline already made once. **No artifact flags that
  the source of truth still contradicts itself** — every downstream artifact
  quietly got it right and none said the input was wrong.
- **Suggested fix**: owner edits `improvement-backlog.md:320–321` to point at the
  corrections instead of repeating the retracted claim. Not fixed here — the
  report does not modify the repo.
- **Fix target**: owner, on `docs/roomyx/improvement-backlog.md` (repo file, outside the job).

---

### WARNINGS

#### W-001: no migration target for an MCP client embedding `serveManagement` — **confirmed gap 1, does not block**
`serveManagement` appears in 11 places across the artifacts. Every one either
preserves its **signature** (TR-4, US-003) or names its embedders as a **victim**
(`discovery-brief.md:243`, `problem-statement.md:233,463`, `stack-decision.md:525`,
`prd.md:885`). **Not one states what they migrate to.** `README:170–172` documents
`serveManagement` as a library entry point, and `README:168` documents `targetPath`
as the MCP input US-004 removes; G6 and SEC-6 keep the escape hatch for the **CLI**
only, so the embedder's replacement is `resolveTargets()` on the CLI side of a
boundary they are not on. **Does not block**: US-015's AC is satisfied by *naming*
them, and every other story stands. It leaves G9's "0 contradicted statements"
audit with a hole no criterion covers.

#### W-002: PKG-8's "0 network calls" names no verifying mechanism — **confirmed gap 4**
The phrase appears in G5, PKG-8, US-009 AC3 and two success-criteria tables. The
only method ever offered is *"with network egress observed"*
(`problem-statement.md:301`, `stack-decision.md:201`) — passive voice, no tool, no
technique. Compounding it: **PKG-8 is a `SHOULD`** in `tech-bestpractices.md` §1,
but `prd.md` G5 and US-009 AC3 promote it to a hard checkbox and G5's success
metric. A criterion cannot be both discretionary upstream and binding downstream.

#### W-003: R5's reaper shape is orphaned between two documents — **confirmed gap 3**
`architecture.md` §8.2 says the idle-timeout-vs-`terminateSession()`-only question
*"is left to the PRD."* `prd.md` Q5 hands it to the owner. Neither settles it.
Alone this would not block — US-014's 404 and `terminateSession()` ACs are
implementable either way. It becomes load-bearing through **V-003**: under
`terminateSession()`-only, a third-party client that simply disconnects still
leaks, so whether "RSS returns to baseline" is even *achievable* depends on the
answer. Bind N (V-003) and this question resolves with it, or vice versa.

#### W-004: two incompatible open-question numbering schemes are live simultaneously
`discovery-brief.md` §Open Questions numbers Q1–Q6 (Q1 amendment ratification,
Q2 version, Q3 install base, Q4 changelog, **Q5 smoke test**, Q6 seed.ts).
`prd.md` §Open Questions renumbers Q1–Q5 (Q1 packaging, Q2 changelog, **Q3 smoke
test**, Q4 seed.ts, **Q5 reaper**). `problem-statement.md` — a live artifact —
cross-references the *discovery* scheme at `:496` (*"decision required, see Q5"*,
meaning the smoke test) and `:510` (*"Phase 0 Q6"*). A reader following
`problem-statement.md:496` into the PRD lands on the **reaper**.

#### W-005: an input explicitly marked "must not be treated as settled" was dropped from the PRD's open questions
`problem-statement.md:514–519` names three unsettled inputs and says downstream
phases must not settle them; one is *"whether the owner ratifies the drafted
amendments as written (Q1)."* The PRD's Open Questions carries the other two
(packaging, seed.ts) and **omits ratification**. It is arguably discharged — US-001
and US-002 each carry an *"Approved by MrCipherSmith acting as owner"* AC — but
the PRD never says that is how it was discharged, so the omission reads as a loss
rather than a decision.

#### W-006: `problem-statement.md` G6's Target still prescribes the phrasing TR-3 defines as a violation
G6's Target (`:317`) reads *"Applied in both `src/server/serve.ts` and
`src/mcp-management/server.ts`, which are ~90% duplicated"* — no extraction
escape. **TR-3**: *"A PRD requirement that says 'apply in both files' is a
violation."* The same document's success-criteria row at `:489` hedges correctly
(*"2/2 …, **or the shape extracted once**"*), so the artifact contradicts itself
internally. Superseded in substance by `D_transport_extraction` (OWNER) and A1,
but never corrected in place.

#### W-007: a source-of-truth acceptance criterion was dropped without a record
`improvement-backlog.md:162` (R1, ACs): *"↑/↓ move the roster; **PgUp/PgDn/Ctrl-U/
Ctrl-D** scroll the transcript."* Every downstream artifact binds **PgUp/PgDn/
Home/End** (UI-3, UI-4, A6, `D_scroll_keys`, US-013). The measured key list of
`ScrollBarRenderable.handleKeyPress` (`architecture.md` §5.4) is `up`/`k`,
`down`/`j`, `pageup`, `pagedown`, `home`, `end` — **Ctrl-U/Ctrl-D are not in it**,
so the backlog's criterion cannot be met by delegation, which UI-3 requires. The
substitution is almost certainly right; **no artifact records that it happened or
why**, so it reads as an unexplained scope reduction against the source of truth.

#### W-008: the test-file count is wrong in three artifacts
`ai/context.md:26` and `stack-decision.md:140` say *"17 test files (~1845 lines)"*;
`architecture.md:128` says *"The existing 17 suites."* Measured: **15** `*.test.ts`
files (21 `describe` blocks). `ai/context.md`'s own inventory table enumerates
exactly **15** — the figure contradicts the list directly beneath it. The
load-bearing count — *"seven suites construct these servers, zero import
internals"* — is **correct** and was re-verified, so the extraction ruling is
unaffected; but TEST-10 tells an implementer to validate against a population
stated wrongly two documents up.

#### W-009: G6 is a P0 goal that cannot be met at P0
`prd.md` G6's target is *"all five sub-criteria"* — binary. Two of the five
(RSS-to-baseline, unknown-session 404) are delivered **only** by US-014, which is
**Priority P1**. Either G6's target admits a P1 tail, or US-014 is P0. As written a
P0 goal has a P1 dependency, which is the priority inversion Step 5 exists to catch.

---

### INFO

- **I-001** — DEC-3's table still marks D-07 *"needs owner ratification"*, while
  `decisions.md` `D-07_new` is a recorded **OWNER RULING** and US-003 treats it as
  settled. Stale in `tech-bestpractices.md` only.
- **I-002** — `chat-view.ts` lives at `src/client/screens/chat-view.ts`, not under
  `components/`. Seam D lists it beside `message-row.ts` (which *is* in
  `components/`) with no path.
- **I-003** — US-007 edits `init.ts`, whose header comment at `:24` cites *"D-01 in
  decisions.md"* **without naming the file** — exactly what DEC-2 forbids, and
  DEC-5 makes extending that comment part of the fix. US-007's constraint refs
  list neither DEC-2 nor DEC-5.
- **I-004** — NG8's *"already fixed"* (the `testing-story.md` step-9 overclaim) is
  an **uncommitted working-tree edit**. `git show HEAD:docs/roomyx/testing-story.md`
  still contains *"even with `--yes`… until you say so again."* Anyone verifying
  NG8 against a clean checkout will find it unfixed.
- **I-005** — `D_transport_extraction` records *"4 hunks"*; `architecture.md` and
  US-003 record *"5 hunks, one pure whitespace."* Measured: exactly 5, one
  whitespace, four real. Consistent in substance; wording only.

---

## The four deliberately-open owner questions: which stories are exposed

Their being open is **not** a violation. Two stories are nevertheless at risk.

| Open question | Stories written to hold | Exposure |
|---|---|---|
| **Release packaging shape** | US-015 abstains explicitly; no story names a version | **None.** Checked every story for a version number or release boundary — zero. |
| **Whether a `CHANGELOG.md` is created** | US-004 requires its own commit; US-015 requires the line *"wherever the project decides that line lives"* | **None.** |
| **Whether the release smoke test is strengthened** | US-006 and US-010 each state they do not touch it | **US-015 AC2 is exposed.** It requires *"a README-vs-behaviour audit runs as a **release gate**, not as an after-the-fact check"* — mandating a release gate while the only release-gate machinery in `release.yml` is line 91, the step this question defers. AC2 names no mechanism and Q3 forbids inventing one. |
| **How the R3/R8 `seed.ts` collision splits** | US-008 and US-010 each written to hold under survive/absorb/delete | **US-010 CLI-1 AC is exposed but hedged.** It reads *"The **three** divergent copies … converge"*; if R3 deletes `seed.ts` there are two, and the AC as literally written becomes unsatisfiable. It carries an explicit hedge (*"Scope of the third call site depends on Q4"*), so this is flagged rather than broken. |

---

## Audit Trail

| Check Category | Items Checked | Passed | Failed |
|---------------|--------------|--------|--------|
| Goals ↔ User Stories (G1–G9 × US-001…US-015) | 24 | 23 | 1 (W-009) |
| Stack ↔ PRD (deps, runtime, no-new-dependency) | 9 | 9 | 0 |
| Architecture ↔ PRD (§1.2 rules, A1–A10, §7, §8) | 22 | 21 | 1 (W-003) |
| Best Practices ↔ PRD (86 constraints + C1–C9) | 95 | 92 | 3 (V-001, V-002, W-002) |
| Internal consistency (orderings, priorities, satisfiability, Q-numbering) | 19 | 15 | 4 (V-003, W-004, W-005, W-009) |
| Completeness (sections, exec summary, traceability, open questions) | 8 | 7 | 1 (W-005) |
| **Artifacts ↔ current repo & dependencies (executed)** | **74** | **70** | **4 (V-001, V-002, V-004, W-008)** |
| Decisions registry (41 rows, incl. the retracted one) | 41 | 41 | 0 |
| Owner rulings survive at every reference site | 8 | 8 | 0 |

Traceability matrix: complete. All nine problems covered; all fifteen stories
trace to a goal and a problem; no story implements a non-goal (NG1–NG9 each
checked against every story). No two stories contradict each other. No P0 story
depends on a P1 story (the one inversion is a *goal*, W-009, not a story).

## Rollback Recommendations

None of the four CRITICALs requires re-running a phase. All are point corrections.

- **V-001** → edit Phase 3 (`tech-bestpractices.md` PKG-3, `architecture.md`
  §1.3 seam H) and Phase 4 (US-009 AC2). Restore `stack-decision.md` C2's wording.
- **V-002** → edit Phase 1 (G7), Phase 3 (FS-1), Phase 4 (US-007 AC1).
- **V-003** → **owner ruling required at this gate**, then edit US-014. Resolve
  jointly with W-003 (the reaper shape), since the achievability of the RSS
  criterion depends on the reaper's shape.
- **V-004** → **owner edit to `docs/roomyx/improvement-backlog.md:320–321`**, in
  the repo, outside the job folder. Deliberately not performed here.

---

| Key | Value |
|-----|-------|
| Created | 2026-09-09 |
| Agent | gproject-consistency-checker |
| Phase | 5 |
| Job | gproject-roomyx-backlog |
| Mode | task_in_project |
| Status | final — pending human approval gate |
