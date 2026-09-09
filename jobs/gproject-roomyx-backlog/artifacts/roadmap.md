# Roadmap: roomyx 0.4.0 defect remediation

Job: `gproject-roomyx-backlog` · Phase 6 · mode `task_in_project`
Inputs: `artifacts/prd.md` (15 stories, 9 epics), `artifacts/architecture.md`
(A1–A10, §4.6 commit ordering, §7 amendment placement), `artifacts/tech-bestpractices.md`
(86 constraints), `artifacts/consistency-report.md` (PASS_WITH_WARNINGS),
`decisions.md` (52 rows incl. one retracted), `docs/roomyx/improvement-backlog.md`
(sizes, source of truth).

> `metaproject: unavailable` — `.metaproject/` exists but has no `index.md`.
> Carried forward from Phases 0–5.

**Every open question is closed.** Six owner rulings landed at the Phase-5/6 gate
(`D_leak_criterion`, `D_reaper_shape`, `D_release_gate`, `D_release_shape`,
`D_changelog`, `D_seed_collision`). This plan resolves Q1–Q5 of the PRD against
them and carries no placeholders.

---

## Overview

- **Milestones**: 3 — **M1 = v0.5.0**, **M2 = v0.6.0**, **M3 = the patch stream**
  (five patch tags, two of them cut *before* M2 — see the release calendar).
- **Total tasks**: 35 (25 delivery, 10 carried-warning / hygiene).
- **Estimated duration**: **≈ 7 days — ≈ 9.5 days — ≈ 15 days** of single-operator
  work (NG9: no parallelisation across people).
- **Critical path**: `T-201 → T-202 → T-206 → T-207 → T-208 → v0.6.0`
  (D-01 amendment → R3 → R8 → release gate → audit → tag) ≈ **20.75 h realistic**,
  the longest dependency chain in the graph.
- **Highest-fan-out task**: **T-102** (transport extraction) — gates T-105 (S2),
  T-106, T-306 (R5 residual) and, transitively, the v0.5.0 tag.

### How to read the estimates

`D_no_reestimate` holds. **Realistic = the backlog's size, verbatim.** The
optimistic/pessimistic columns are a presentational band (×0.6 / ×2) around that
fixed input, not a re-estimate, and they are not evidence of anything. Two tasks
carry a *plan-overhead* band instead, marked **[unpriced]** — the transport
extraction (which `D_transport_extraction` says disturbs no item's size) and the
two test-observation channels the consistency report found missing. The single
permitted re-price is **US-012's** (`D_r1_reprice`), already ruled. Conversion:
*minutes* = 0.5 h · *an afternoon* = 4 h · *half a day* = 4 h · *a day* = 8 h.

### Build order is not the ranked order

Both orderings are inputs (`D_ranking_axis`) and both survive here. **Every table
below is build order.** The ranked five — R1, R2, R8, R4, R5 — is the room's
weighting and appears nowhere as a queue.

| | Sequence |
|---|---|
| **Build order** *(this document, everywhere)* | S1 · S2 · S4 → **R3** → R4 → R8 → R2 → R1 · (R5 residual last) |
| **Ranked by weight** *(not a schedule, recorded for legibility)* | R1, R2, R8, R4, R5 |

- **R3 is position zero by sequence and outside the ranked five by category.** It
  was excluded from the ranking for a gating reason (it needs an owner's decision
  amendment), not a value reason — its criterion-3 score is 10/10.
- **R5 is in the ranking and not in the build order.** Its exploitable half ships
  first as S2 (T-105); the residual is the last delivery task in the plan.
- **The named failure mode this ordering exists to prevent**: an implementer who
  reads the ranked five as a work queue opens with a three-day render rewrite for
  rooms they have no supported way to create.
- The **transport extraction** stands outside both lists: not a finding, no rank,
  no size of its own.

---

## Release calendar (chronological — milestones are releases, not time boxes)

| Order | Tag | Milestone | Contents | Demo-able at its end |
|---|---|---|---|---|
| 1 | **v0.5.0** | M1 | S1 + S2 + S4 (+ extraction, D-06 & D-07 register entries, `CHANGELOG.md`, **release gate increment 1**) | The room's own 400-POST cross-origin reproduction returns **0/400 accepted**; the attacker-path write no longer lands on disk; roomyx's own client still gets 200; and the release job now **fails** on a tag whose artifact prints a different version |
| 2 | v0.5.1 | M3 | US-012 — the seq-1 fix | A one-message room draws its one message |
| 3 | v0.5.2 | M3 | US-007 — S3 | A hand-edited `startup-room/SKILL.md` survives `roomyx init`, or is backed up with a visible warning |
| 4 | **v0.6.0** | M2 | R3 + R4 + R8 (+ D-01 amendment, **release gate increment 2** — `--help`) | A clean machine runs the README top to bottom — `install → room new → serve` — with no `npm root -g`; `serve --help` prints and exits 0 without starting anything; 6/6 measured CLI lines behave as documented, verified against a packed tarball |
| 5 | v0.6.1 | M3 | US-011 — R2 (+ R9 ride-along) | `roomyx serve nope.jsonl` names the file, exits non-zero, registers nothing; no path yields *live* + *disconnected* |
| 6 | v0.6.2 | M3 | US-013 — R1's render half | The transcript wraps, shows `kind` and reply markers, distinguishes empty from error, and `PgUp/PgDn/Home/End` scroll it |
| 7 | v0.6.3 | M3 | US-014 — R5 residual | `handle.sessionCount === 0` after 200 connect/close cycles and after an idle sweep; unknown session id → 404 |

`D_release_shape` fixes the two minors. The patch stream interleaves: **0.5.1 and
0.5.2 are cut before 0.6.0 development finishes**, because neither waits on
anything in M2 and the hour that makes every room's first message exist must not
wait on a two-day parser (`improvement-backlog.md:174–176`).

---

## Milestone 1 — **v0.5.0**: the loopback door closes

**Ships** (`D_release_shape`): **S1** (`targetPath`) + **S2** (guard + SDK floor
`>=1.25.0`) + **S4** (`--frozen-lockfile`).
**Why a minor and not a patch**: removing a field from the network tool breaks
MCP embedders; under 0.x a breaking change belongs in the minor position.
**Deliverable / demo**: re-run the room's reproduction — a cross-origin POST
naming an attacker-chosen path — and observe **403 / `-32000`**, **0/400
accepted** (was 400/400), **no file written, no directory created**, and roomyx's
own `Origin`-less client still completing the handshake at **200**.
**Duration**: 5.75 h — **9.25 h** — 18.5 h.
**The release gate is closed in this release** (`D_release_gate_two_increments`):
`release.yml:91` loses its `|| true` here, at T-110, asserting **`roomyx --version`
→ exit 0 and stdout == `${GITHUB_REF_NAME#v}`**. The `--help` assertion is the
step's second increment and arrives in M2 (T-207), once R8 makes `--help` exit 0.

### PR shape (from `architecture.md` §4.6 — commit order is load-bearing)

```
PR "0.5.0 — loopback surface"
  commit 1  T-102  extract src/server/http-transport.ts  + D-07 into docs/roomyx/decisions.md
  commit 2  T-104  S1: targetPath removed            (own commit — revert-proof, SEC-7)
  commit 3  T-105  S2: guard + sdk floor             + D-06 amendment in this commit (DEC-3)
separate PR (or inside another PR's description, per the backlog)
            T-103  S4: --frozen-lockfile             — lands with or before commit 3
            T-110  release gate increment 1          — same workflow file, after T-103
```

### Tasks

| ID | Title | Layer | Depends on | Estimate (opt / **real** / pess) | Story |
|---|---|---|---|---|---|
| T-101 | Create `CHANGELOG.md` (Keep-a-Changelog shape), open the `0.5.0` section | docs | — | 0.3 h / **0.5 h** / 1 h **[unpriced]** | US-015 |
| T-102 | Extract `src/server/http-transport.ts` (`serveMcpOverHttp` over `McpHttpTransportOptions`); `serve()`/`serveManagement()` become thin adapters with unchanged signatures; **D-07** written into `docs/roomyx/decisions.md` in this same commit | backend | — | 2 h / **3 h** / 5 h **[unpriced]** | US-003 |
| T-103 | `release.yml` install step → `bun install --frozen-lockfile`; diff against `ci.yml:16` shows no divergence; file **not** renamed, `v*` stays the only trigger | infra | — | 0.1 h / **0.1 h** / 0.3 h | US-006 |
| T-104 | Remove `targetPath` from `roomyx.skills.sync` `inputSchema` **and** its handling at `mcp-management/server.ts:62–74`; update `test/mcp-management/server.test.ts:81` in this commit; edit `README:168`; add the S1 changelog line | backend | T-101 | 0.3 h / **0.5 h** / 1 h | US-004, US-015 |
| T-105 | S2: `enableDnsRebindingProtection` + `allowedHosts` **and** `allowedOrigins` as SDK constructor options in `http-transport.ts` **only**; allowlists built lazily from the bound port **inside `createSession()`**; `package.json` → `@modelcontextprotocol/sdk >=1.25.0`; **D-06 amendment in this commit** | backend | T-102, T-103 | 2.5 h / **4 h** / 8 h | US-005, US-002 |
| T-106 | S2's effect tests *(a part of T-105's afternoon, shown not added)*: cross-origin `Origin: https://evil.example` → 403/`-32000`; rebound `Host` → 403/`-32000`; **positive case** — the `Origin`-less TUI client and `isRoomLive()` get 200; 400-POST replay → 0/400 | testing | T-105 | *(inside T-105)* | US-005 |
| T-107 | Effect test for S1: replay the cross-origin request naming an attacker path; assert **the file is absent from disk** and no directory was created | testing | T-104 | *(inside T-104)* | US-004 |
| T-108 | Pre-tag README-vs-behaviour audit for 0.5.0: `README:168` consistent; `:18` and `:82` unchanged this release; the audit **names the MCP embedder** of `serveManagement` and states their migration target in `CHANGELOG.md` (closes W-001) | docs | T-104, T-105 | 0.3 h / **0.5 h** / 1 h | US-015 |
| **T-110** | **Strengthen the release gate, increment 1** (`D_release_gate`): `release.yml:91` loses `\|\| true`; the step runs **`roomyx --version`** against the packed artifact and asserts **exit code 0** and **stdout == `${GITHUB_REF_NAME#v}`**. Closes the discarded-exit-code hole, proves the installed artifact runs, and proves the version it prints is the version that was tagged — an end-to-end property no current step checks on the packed artifact | infra | T-103 | 0.2 h / **0.25 h** / 0.5 h | US-015 |
| T-109 | Tag `v0.5.0`; verify the provenance-signed tarball installs and that `bun.lock` resolved identically in CI and release | infra | T-103, T-108, T-110 | 0.3 h / **0.5 h** / 1 h | US-006, US-015 |

> **Does T-108 still earn its place now that the gate exists? Yes — keep it.** It
> was written when `release.yml` had no working assertion at all, but it was never
> standing in for the smoke step. T-110 checks that the *artifact* runs and reports
> the version it was tagged as; T-108 checks that the *README* still describes what
> the artifact does, and names the `serveManagement` embedder (W-001) in
> `CHANGELOG.md`. No mechanical gate reads prose. The one sentence that *was*
> load-bearing on the gate's absence — "a gate executed by a human rather than by
> CI, for one tag only" — is struck: T-108 is a documentation audit on its own
> merits, at every tag, not a stand-in.

### Checkpoint (all must hold before the tag)

- `release.yml:91` contains no `|| true`, and a deliberately mismatched local tag
  makes the job **fail** — verified once, not assumed.
- The guard diff touches **exactly one file**. A diff touching both
  `serve.ts` and `mcp-management/server.ts` means T-102 was skipped (TR-3).
- **Zero test files edited by T-102.** The existing seven server-constructing
  suites pass untouched (TEST-10). If one needs editing, the extraction changed
  behaviour — revert and redo.
- No acceptance test asserts a configuration value (SEC-3, TEST-12).
- `docs/roomyx/decisions.md` gained **D-07** (T-102's commit) and the **D-06
  amendment** (T-105's commit), both in Russian `## D-NN` /
  *Решение / Причина / Отвергнутая альтернатива* shape, each naming its own file.
- Neither the amendment, the code comments nor the README calls the guard
  authentication (SEC-9); no token or session secret was introduced (SEC-10).

---

## Milestone 2 — **v0.6.0**: the CLI becomes learnable and gets an on-ramp

**Ships** (`D_release_shape`): **R3** + **R4** + **R8**.
**Build order inside the milestone**: **R3 → R4 → R8**, and R3 is gated on the
D-01 amendment. `D_seed_collision` settles the PRD's Q4: **R3 absorbs
`src/cli/seed.ts`**, so R8 then unifies **two** parsers (`cli.ts:20–36`,
`client/index.ts:12–22`), not three. US-010's "three divergent copies" AC reads
as two after T-202 — this is the ruled outcome, not a shortfall.
**Deliverable / demo**: on a clean machine, `npm i -g @mrciphersmith/roomyx` →
`roomyx room new demo.jsonl --goal … --roster …` → `roomyx serve demo.jsonl`,
following only the README, with no `npm root -g` anywhere; then the six measured
CLI lines re-run **against a packed tarball** (`./.release/prefix/bin/roomyx`),
6/6 as documented; then the same tarball on a `bun`-less `PATH` printing a
diagnostic naming Bun and exiting 1.
**Duration**: 15 h — **25 h** — 50 h.

### Tasks

| ID | Title | Layer | Depends on | Estimate (opt / **real** / pess) | Story |
|---|---|---|---|---|---|
| T-201 | **D-01 amendment** into `docs/roomyx/decisions.md`, own commit: D-01 constrains the *server*, not the *package*; invariant is one writer per live room; `room new` = writers 0→1; `room append` refuses a live path, `--force` overrides. Names its own file (DEC-2). Approved by MrCipherSmith **acting as owner**, recorded explicitly | docs | — | 0.3 h / **0.5 h** / 1 h | US-001 |
| T-202 | **R3**: `roomyx room new <path> --goal --roster` and `roomyx room append` as `bin`-reachable subcommands; **live-room refusal implemented** (`listLiveRooms()`) with `--force`; `seed.ts` absorbed; write-temp-then-rename; `safeParse` + explicit throw; errors name the path; README walkthrough drops the `npm root -g` invocation; first test file for these commands | backend | **T-201** (gate) | 2.5 h / **4 h** / 8 h | US-008 |
| T-203 | **R4**: `src/bin/roomyx.js` + `src/bin/roomyx-client.js`, `#!/usr/bin/env node`, `exec` bun on the real TS entry; `bin` + `files` updated; `README:18–19` prose; no `postinstall`, no fetch, no `dist/` | infra | T-204, T-205 | 2.5 h / **4 h** / 8 h | US-009 |
| T-204 | **Build the PKG-4(b) observation channel** — `test/` has no way today to count `runClient()` invocations through a launcher. Needed to prove `import.meta.main` stays `false` on the `await import()` path (`D_launcher_import_meta_main`). Suggested channel: `runClient()` emits one line on a test-controlled fd/env-gated marker, asserted from a `Bun.spawn` subprocess — **exactly once** | testing | — | 1 h / **2 h** / 4 h **[unpriced]** | US-009 |
| T-205 | **Bind and build PKG-8's "0 network calls" observation** — the phrase appears in G5, PKG-8 and US-009 AC3 with no named mechanism (W-002), and is a `SHOULD` upstream and a hard checkbox downstream. **This plan binds it as MUST** and fixes the mechanism: run the launcher via `Bun.spawn` with a `PATH` stripped of `bun` **and** a sentinel proxy/`DNS` env pointing at a local listener that records connections; assert zero connections, non-empty stderr naming Bun, exit 1 | testing | — | 1 h / **2 h** / 4 h **[unpriced]** | US-009 |
| T-206 | **R8**: single `parseFlags` in `src/cli/flags.ts`; two call sites converge; bare/unparseable/unknown flags rejected loudly naming the flag; `--help` → stdout, exit 0, **no server, no room id**; `serve` default port → `0`, `mcp` stays `4320`, `README:36/42/82` **in this commit**; `runRoomsList()` honours `--registry` (R13); boolean contract at `cli.ts:72`/`:158` preserved; `noUncheckedIndexedAccess` respected | backend | **T-202** (`D_seed_collision`) | 10 h / **16 h** / 32 h | US-010 |
| T-207 | **Strengthen the release gate, increment 2** (`D_release_gate`): add **`roomyx --help` → exit 0 and usage text on stdout** to the step T-110 already hardened. Possible only now: `--help` exits 1 until T-206, and `bin/roomyx` is a launcher only after T-203. Lands **in T-206's PR** | infra | **T-206**, T-203, T-110 | 0.2 h / **0.25 h** / 0.5 h | US-015 |
| T-208 | 0.6.0 README-vs-behaviour audit — now executed **by** the strengthened gate plus a pre-tag read of `README:18` (T-203), `:36/:42/:82` (T-206), `:168` (already 0.5.0); `CHANGELOG.md` 0.6.0 section, calling out `serve`'s default-port change | docs | T-207 | 0.3 h / **0.5 h** / 1 h | US-015 |
| T-209 | Tag `v0.6.0`; re-run the six-line reproduction block against the packed tarball as the last pre-tag act | infra | T-208 | 0.3 h / **0.5 h** / 1 h | US-010, US-015 |

> **Why the gate is checked in two increments, and why the second one is here.**
> The `|| true` hole itself is closed in **0.5.0** (T-110), because the step does
> not have to be about `--help`: `roomyx --version` was added in 0.4.0, exits 0
> today, and prints the manifest version, and the release job already holds the tag
> in `GITHUB_REF_NAME`. Asserting *exit 0 and stdout == the tag* is **stronger**
> than what the deferred `--help` check would have proved — it establishes
> end-to-end, on the packed artifact, that the thing published prints the version
> it was published as. The `--help` assertion is genuinely blocked until here:
> `--help` **exits 1 today** (that is half of R8), so adding it in 0.5.0 would fail
> the security release on a defect that release does not contain, and `bin/roomyx`
> is not a launcher until T-203. REL-5's ordering (*"once R8 gives `--help` real
> semantics and R4 changes what `bin/roomyx` is"*) applies to that clause only —
> not to the `|| true`. Recorded below as `D_release_gate_two_increments`; the
> single-increment alternative, and why it was wrong, is kept in that row.

### Checkpoint

- `git log` shows T-201's commit as an **ancestor of T-202's first commit**. If
  R3 shipped and the amendment did not, R3 is not done.
- `git show <T-105 commit> --stat` still lists `docs/roomyx/decisions.md` (0.5.0
  evidence, re-checked at 0.6.0 tag time).
- `roomyx serve --help` starts no server and mints no room id — verified by
  process **and registry** inspection after the call.
- Both PKG-4 assertions run **through the launcher**, never through `cli.ts`.

---

## Milestone 3 — the patch stream

**Ships**: everything not enumerated in `D_release_shape`'s two minors — the
render work (which the ruling assigns here by name), plus S3, R2 and R5's
residual, none of which changes a published surface that a minor would exist to
announce. **Five tags**, two of them cut before v0.6.0.
**Duration**: 12 h — **≈ 5 days** — ≈ 10 days.

### v0.5.1 — the first message exists

| ID | Title | Layer | Depends on | Estimate | Story |
|---|---|---|---|---|---|
| T-301 | Write the seq-1 test **against current code and observe it red**, then add `horizontalScrollbarOptions: { visible: false }` at `chat-view.ts:36` and watch it go green; revert-to-red verified, not assumed. Three messages, 80×12, `createTestRenderer` + `captureCharFrame()` | frontend | — | 0.6 h / **1 h** / 2 h | US-012 |

Ships alone, the day after v0.5.0. It is blocked by nothing, is the one ruled
re-price (`D_r1_reprice`: the seq-1 defect is the horizontal scrollbar, not the
sticky-bottom model, so no state machine is built), and it takes the permanently
drawn vertical thumb with it as a consequence — **no separate "hide the thumb"
work is done**.

### v0.5.2 — `roomyx init` stops eating hand edits

| ID | Title | Layer | Depends on | Estimate | Story |
|---|---|---|---|---|---|
| T-302 | Route the unconditional `copyFileSync` at `init.ts:44` through `syncSkill()` from `installer/skill-sync.ts` — backup, hash record, warnings. **`init.ts` imports no `syncSkill` today; this task creates that dependency edge** (`D_s3_introduces_syncskill_edge`). The `existsSync` guards at `init.ts:38–43` are the *contrast*, not a pattern to follow. `InitResult`'s shape change matched by `cli.ts:53–56`'s print **in the same commit** | backend | — | 2.5 h / **4 h** / 8 h | US-007 |
| T-303 | Rides in T-302's commit: extend `init.ts:24`'s decision-carrying comment to **name its register file** (`docs/roomyx/decisions.md`) — DEC-2/DEC-5, closes I-003 | docs | T-302 | *(inside T-302)* | US-007 |

Test: edit a real file in a temp dir, run `init` a second time, assert **file
contents and the printed warning** — never that a call happened (TEST-12).

### v0.6.1 — reported state equals actual state

| ID | Title | Layer | Depends on | Estimate | Story |
|---|---|---|---|---|---|
| T-304 | `callTool<T>()` at `mcp-client.ts:113–118` checks `result.isError` **before** parsing; `runServe()` calls `loadRoomLog()` **before** binding, so a bad path never registers; `log/store.ts:58` and `:71` name the file path; `ConnectionStatus` widened only with `status-bar.ts:40` in the same commit and no second state variable; **R9 ride-along** — `shutdown()` at `cli.ts:85–91` closes *before* deregistering | backend | — | 3.5 h / **5.5 h** *(1.5 h + half a day, the backlog's two parts)* / 11 h | US-011 |

**R9's other half stays out.** `httpServer.close()` draining an attached SSE
stream — `serve` surviving SIGTERM for 30 s with a client attached — is out of
scope and must not be fixed here (NG1, SCOPE-3).

### v0.6.2 — the pane becomes readable

| ID | Title | Layer | Depends on | Estimate | Story |
|---|---|---|---|---|---|
| T-305 | `wrapMode: "word"`, `message-row.ts`'s `height: 1` removed, no hand-rolled wrapper; `kind` + reply marker from `in_reply_to`; `setEmpty()` / `setError(message)` so a quiet room, a one-message room and a missing log render **differently**; `ChatView.handleTranscriptKey(event): boolean` delegating to `ScrollBoxRenderable.handleKeyPress` for `pageup`/`pagedown`/`home`/`end`; `up`/`down` **stay on the roster**; `scroll` stays `private`; `agent-modal.ts` still renders after the row-shape change; behavioural assertion of `testing-story.md:171` through the rendered frame | frontend | **T-301**, **T-304** | see below | US-013 |

**Two hard gates on this task.** It must not merge without **T-304** — shipping
it alone leaves an unreadable-log room rendering a blank pane that now *looks
polished*, a wrong answer upgraded to a credible one. And **T-301 comes first**
inside R1 (UI-7): wrapping raises `content.height`, which raises `maxScrollTop`,
which multiplies the one-row over-scroll into several rows on the first frame.

**Size, with the parts shown rather than aggregated.** R1 whole is **~3 days**
(backlog, re-priced *up* from 2.5 when R11 merged in). Its parts: the scroll half
is **~1 h** (T-301, the one ruled re-price), and A4 **deletes** the
scroll-state-machine sub-task from the remainder entirely — `stickyScroll`
already suspends on manual scroll and re-engages at the bottom, measured by
rendering. The backlog never priced the remainder separately, and this plan does
not invent a number for it: **carry R1's 3 days as the ceiling for T-305** and
expect it to come in under, because a priced sub-task was removed from it.

**No scroll state machine is written.** A hand-rolled one is a second, worse copy
of correct library code and is a review-rejectable violation (UI-1).

`Home`/`End` replacing `Ctrl-U`/`Ctrl-D` is a recorded substitution, not scope
loss (`D_r11_key_substitution`, W-007): `handleKeyPress` implements all four
ruled keys natively, whereas half-page scrolling needs its own delta arithmetic —
the hand-rolled scroll math UI-1 exists to forbid. The criterion stands at
`improvement-backlog.md:162` under **R1** (it originated in R11, retired into R1).

### v0.6.3 — sessions are reclaimed

| ID | Title | Layer | Depends on | Estimate | Story |
|---|---|---|---|---|---|
| T-306 | R5 residual: unknown `mcp-session-id` → **404**, delegated to the SDK, **no transport minted** (the unconditional `createSession()` is the leak); `terminateSession()` replaces `close()` at `mcp-client.ts:56` and `registry.ts:229`; **server-side idle sweep**; `ServeHandle` gains a **session count**. Lands in **exactly one file** — `src/server/http-transport.ts` | backend | **T-102** | 5 h / **8 h** *(a day, explicitly minus the guard)* / 16 h | US-014 |

#### The leak criterion, with N bound

`D_leak_criterion` replaces the RSS predicate: **the leak is proven by the session
map being empty**, and `ServeHandle` gains a session count to observe it. A leak
is by nature an entry that was not removed, not bytes; a map size is a binary
predicate, while RSS on a GC runtime gives false results in both directions.

**N = 200.** Three assertions, all against a real `serve()` on `port: 0` with a
real `StreamableHTTPClientTransport`:

1. **`handle.sessionCount === 0` after 200 clean connect/`terminateSession()`
   cycles.**
2. **`handle.sessionCount === 1` observed mid-cycle**, while one client is
   attached. Without this, a counter that never increments passes the first
   assertion vacuously — the exact failure class the old RSS criterion could not
   distinguish.
3. **`handle.sessionCount === 0` after one *abandoned* connection plus one sweep
   interval**, with the idle interval configured short for the test. A
   hard-killed client never sends DELETE, so a cycle count cannot prove the sweep;
   it needs its own assertion (`D_reaper_shape`).

**Why 200 and not some other number.** The map predicate is exact at *any* N — 2
would detect the leak — so N is not chosen for statistical power. It is chosen
for **continuity with the recorded observation**: 200 is the exact cycle count on
the harness that measured **+18 MB / 200 cycles**, so the new criterion refutes
the original finding on its own terms and on its own configuration rather than on
a fresh setup nobody has seen. 200 cycles against a loopback server also runs
well inside the suite's poll-until-deadline budget, so the honest number costs
nothing.

`D_reaper_shape` closes both W-003 and the PRD's Q5: **explicit termination
*plus* a server-side idle sweep.** `terminateSession()` alone fixes only
well-behaved clients; the item exists because of the clients that do not say
goodbye. No adversary required.

---

## Carried warnings from the consistency report (PASS_WITH_WARNINGS)

Every surviving warning is a task here, not a dropped line. Four of the report's
open items were closed by the six rulings and are marked as such rather than
scheduled.

| Report item | Status | Task | Attached to |
|---|---|---|---|
| **V-003** — US-014 AC1 has no N and no tolerance | **CLOSED** by `D_leak_criterion` + N=200 above | — | M3 / v0.6.3 |
| **V-004** — backlog R5 still carried its own retracted claim | **CLOSED** by `D_backlog_r5_wording` (orchestrator fixed in place) | — | — |
| **W-003** — reaper shape orphaned between two documents | **CLOSED** by `D_reaper_shape` | — | M3 / v0.6.3 |
| **W-007** — a source-of-truth AC dropped without a record | **CLOSED** by `D_r11_key_substitution` | — | M3 / v0.6.2 |
| **W-001** — no migration target named for an MCP client embedding `serveManagement` | open → task | **T-108** — the 0.5.0 audit names them *and* `CHANGELOG.md` states the target: named targets (`claude`/`codex`/`keryx`/`all`) over MCP; literal paths remain **CLI-side only** via `resolveTargets()`. **No shim, alias or deprecation cycle** (REL-7). This is precisely the hole `D_changelog` created the file to fill | M1 |
| **W-002** — PKG-8's "0 network calls" names no mechanism, and is `SHOULD` upstream / hard checkbox downstream | open → task | **T-205** — binds it as MUST and builds the observation channel | M2 |
| **PKG-4(b)** — the launcher-invocation assertion has **no observation channel in `test/`** | open → task | **T-204** — build the channel before T-203 can be called done | M2 |
| **W-004** — two live open-question numbering schemes | open → task | **T-401** | M1 (hygiene) |
| **W-005** — amendment ratification dropped from the PRD's open questions | open → task | **T-402** | M1 (hygiene) |
| **W-006** — `problem-statement.md:317` still prescribes the "apply in both files" phrasing TR-3 defines as a violation | open → task | **T-403** | M1 (hygiene) |
| **W-008** — test-file count wrong in three artifacts (17 stated, **15** measured) | open → task | **T-404** | M1 (hygiene) |
| **W-009** — G6 is a P0 goal with a P1 tail | open → task | **T-405** | M3 |
| **I-001** — DEC-3 still marks D-07 "needs owner ratification" | open → task | **T-406** | M1 (hygiene) |
| **I-002** — seam D lists `chat-view.ts` with no path (`src/client/screens/`) | open → task | **T-406** | M1 (hygiene) |
| **I-003** — `init.ts:24` cites a D-01 without naming its file | open → task | **T-303** | M3 / v0.5.2 |
| **I-004** — NG8's "already fixed" is an **uncommitted working-tree edit** | open → task | **T-407** | M1 (hygiene) |
| **I-006** — US-007 cites `init.ts:36–41`; the guards run `:38–43` | open → task | **T-406** (already corrected in T-302's text above) | M1 (hygiene) |
| **I-007** — the `Ctrl-U`/`Ctrl-D` criterion attributed to R11; it stands under R1 at `improvement-backlog.md:162` | open → task | **T-406** (already corrected in T-305's text above) | M1 (hygiene) |
| **I-005** — `D_transport_extraction` says 4 hunks; measured 5, one whitespace | open → task | **T-406** | M1 (hygiene) |

### Hygiene tasks

| ID | Title | Layer | Depends on | Estimate | Story |
|---|---|---|---|---|---|
| T-401 | Adopt the **PRD's** Q-numbering as canonical and fix `problem-statement.md:496` and `:510`, which cross-reference the *discovery* scheme (a reader following `:496` lands on the reaper). Since all five are now ruled, replace each Q with a pointer to its ruling row in `decisions.md` | docs | — | 0.3 h / **0.5 h** / 1 h | US-015 |
| T-402 | Record that amendment **ratification** (discovery Q1) is discharged by US-001's and US-002's *"approved by MrCipherSmith acting as owner"* criteria — so the omission reads as a decision, not a loss | docs | — | 0.2 h / **0.25 h** / 0.5 h | US-001, US-002 |
| T-403 | Correct `problem-statement.md:317` (G6 Target) to the extraction phrasing; its own `:489` row already hedges correctly, so the document contradicts itself in place | docs | — | 0.2 h / **0.25 h** / 0.5 h | US-003 |
| T-404 | Fix the test-file count: `ai/context.md:26`, `stack-decision.md:140`, `architecture.md:128` — **15**, not 17. The load-bearing count (*seven suites construct these servers, zero import internals*) is correct and stays | docs | — | 0.2 h / **0.25 h** / 0.5 h | US-003 |
| T-405 | Resolve W-009 by dating the goal rather than re-prioritising: record that **G6's binary "all five sub-criteria" target is met at v0.6.3**, that US-014 is the last P0-grade item in the patch stream, and that `D_release_shape` is what places it after 0.6.0. G6 is not partially met at 0.5.0 — three of five sub-criteria are | docs | T-306 | 0.2 h / **0.25 h** / 0.5 h | US-014 |
| T-406 | Sweep the INFO corrections into their artifacts: I-001 (DEC-3's D-07 row is a settled OWNER ruling), I-002 (`src/client/screens/chat-view.ts`), I-005 (5 hunks, one whitespace), I-006 (`init.ts:38–43`), I-007 (R11 → retired into R1, live at `:162`) | docs | — | 0.5 h / **1 h** / 2 h | — |
| T-407 | Commit or revert the **uncommitted working-tree edit** to `docs/roomyx/testing-story.md` that NG8 calls "already fixed" — `git show HEAD:` still contains the overclaim, so anyone verifying NG8 against a clean checkout finds it unfixed. Do this **before v0.5.0**, so the tag is cut from a tree that matches its own non-goals | docs | — | 0.2 h / **0.25 h** / 0.5 h | — |

The hygiene tasks ride inside M1's PRs and carry no tag of their own. They are
listed separately only so none of them is confused with delivery work.

---

## Dependency graph

```
   ┌───────────────────────────── M1 · v0.5.0 ──────────────────────────────┐
   │  T-101 CHANGELOG ──► T-104 S1 ──► T-107 (S1 effect test) ──┐            │
   │  T-102 extraction ─► T-105 S2 ──► T-106 (S2 effect tests) ─┼─► T-108 ──┐│
   │                        ▲   (S4 with-or-before S2, SEC-2)   │   audit   ││
   │  T-103 S4 ─────────────┴──► T-110 gate increment 1 ────────┴───────────┼┼─► T-109
   │                             (--version, exit 0, == tag)                ││   tag v0.5.0
   │  (T-401…T-404, T-406, T-407 hygiene ride inside these PRs)             ││
   └────────────────────────────────────────────────────────────────────────┘│
   │◄────────────────────────────────────────────────────────────────────────┘
   │
   ├──────────────► T-301 seq-1 ─────────────────────────► v0.5.1
   ├──────────────► T-302 S3 ─► T-303 ───────────────────► v0.5.2
   │
   │                 ┌────────────────────── M2 · v0.6.0 ──────────────────────┐
   │  T-201 D-01 ──► T-202 R3 ──► T-206 R8 ──► T-207 gate ──► T-208 ──► T-209 tag v0.6.0
   │  amendment       (absorbs      (2 parsers,   increment 2
   │  (gate)           seed.ts)      not 3)       (--help)  ▲
   │  T-204 PKG-4(b) ─┐                                     │
   │  T-205 PKG-8 ────┴─► T-203 R4 ──────────────────────────┘
   │                     (T-110 ──────────────────────────► T-207: same step, 2nd increment)
   │
   ├──────────────► T-304 R2 (+R9 ride-along) ──────────► v0.6.1
   │                      │
   │  T-301 ──────────────┴─► T-305 R1 render half ─────► v0.6.2
   │
   └─ T-102 ───────────────► T-306 R5 residual ──► T-405 ► v0.6.3
```

**Verified acyclic.** No task depends, directly or transitively, on a successor.

### The edges that are rulings, not conveniences

| Edge | Why it exists | Source |
|---|---|---|
| T-102 → T-105 | The guard must land in **one** file. Skipping the extraction means the security fix is one lapse from shipping in only one of two duplicated bodies, on an immutable provenance-signed tarball | TR-1/2/3, A1, `D_transport_extraction` |
| T-102 → T-306 | Same reason, same file, for the 404 + sweep edit | TR-3, `architecture.md` §4.6 |
| T-103 **not after** T-105 | A raised SDK floor is meaningless while the release job resolves freely under `--provenance` — provenance would attest a tree nobody tested | SEC-2, `D_s4_before_s2` |
| T-201 → T-202 | Amending a recorded decision is the **owner's** act. `git log` must show the amendment as an ancestor of R3's first code commit | `D_decision_gates`, US-001 |
| **T-105 ⊃ US-002** | The D-06 amendment is **inside S2's commit**, not a follow-up. If the guard ships and the reasoning does not, the next reader of D-06 still believes loopback binding excludes a browser | DEC-3, `improvement-backlog.md:88–92` |
| **T-102 ⊃ D-07** | The new register entry lands in the extraction commit itself — a structural decision that outlives the PR that made it | `D-07_new` |
| T-202 → T-206 | **R3 before R8**: R3 absorbs `seed.ts`, so R8 unifies two parsers rather than three. The reverse means unifying a file that disappears immediately afterwards | `D_seed_collision` |
| T-301 ∥ (independent of T-305) | The seq-1 fix is **independently shippable ahead of the rest of R1** and ships as its own tag. Handed over as one unit, the hour that makes every room's first message exist waits on three days | `improvement-backlog.md:174–176` |
| T-301 → T-305 | Intra-R1 order: fix the over-scroll **before** wrapping, or wrapping multiplies it | UI-7, A5, `architecture.md` §5.8 |
| T-304 → T-305 | R1 must not merge without R2 | US-013, `improvement-backlog.md:138` |
| T-103 → T-110 | The gate edit and the install-step edit touch the same workflow; `--frozen-lockfile` lands first so the hardened step runs against the tree CI tested | REL-3, SEC-2 |
| T-203 + T-206 → T-207 | Increment **2** asserts `--help` exits 0 against a launcher-shaped `bin`; both must be true first. Increment **1** (T-110) has no such dependency — `--version` exits 0 today | REL-5, `D_release_gate` |
| T-204, T-205 → T-203 | R4 is not done until its two effect assertions are observable; neither channel exists in `test/` today | PKG-4(b), PKG-8, W-002 |

---

## Risk-adjusted timeline

| Scenario | Duration | Assumptions |
|---|---|---|
| Optimistic | ≈ 7 days | Every backlog size holds; the extraction edits zero tests first try; the two new test-observation channels (T-204, T-205) work as sketched; T-305 lands well under R1's 3-day ceiling because the state-machine sub-task was deleted from it |
| Realistic | **≈ 9.5 days** | Backlog sizes verbatim; one or two channels need a second design pass; R8's two-parser convergence turns up one call-site surprise |
| Pessimistic | ≈ 15 days | The extraction changes behaviour on the first attempt and is reverted and redone (TEST-10's own instruction); PKG-8's egress observation proves awkward on this platform; `ConnectionStatus` widening cascades through `status-bar.ts` further than measured |

**The largest single scheduling risk is T-206 (R8, ~2 days realistic, 16 h)** — it
is the longest task, it sits on the critical path, and both the release gate
(T-207) and the v0.6.0 tag queue behind it. **The largest correctness risk is
T-102**: it is behaviour-preserving *by construction* and self-checking (seven
existing suites, zero edits), so it is cheap to be wrong about — but being wrong
about it silently is how a security fix lands in one of two files.

---

## Independent tracks (ordering freedom, not staffing)

**NG9 forbids parallelisation across people.** Everything below means "a single
operator may reorder these freely", or "a multi-agent runner may take these in
one wave" — not "add a second person".

- **Wave 1** (nothing blocks them): T-101, T-102, T-103, T-201, T-204, T-205, and
  every hygiene task T-401…T-407.
- **Wave 2**: T-104 and T-105 (after T-102/T-103); T-110 (after T-103); T-202
  (after T-201); T-203 (after T-204/T-205); T-301; T-302; T-304 — seven tasks with
  no edges between them.
- **Wave 3**: T-206 (after T-202); T-306 (after T-102); T-305 (after T-301 **and**
  T-304).
- **Serialised by tags, not by code**: the release tasks (T-108/T-110/T-109,
  T-207/T-208/T-209) are ordered by the calendar above.

Note that **T-301 and T-302 are cut as tags before v0.6.0 finishes**, so the patch
stream is a milestone by *content*, not by contiguous time.

---

## Integration with job-orchestrator

- **One orchestrator run per release tag**, not per milestone: `v0.5.0`, `v0.5.1`,
  `v0.5.2`, `v0.6.0`, `v0.6.1`, `v0.6.2`, `v0.6.3`. Each run's exit condition is
  the checkpoint list for that tag.
- **Tasks map to `issue-analyzer` output** one-to-one. Each task's *Depends on*
  column is the wave assignment; the waves are listed above.
- **Two tasks are owner acts and must not be dispatched to an implementer agent**:
  **T-201** (the D-01 amendment) and the D-06 amendment carried inside **T-105**.
  They require MrCipherSmith approving *as owner*, recorded explicitly rather than
  as an implicit self-merge. Owner == implementer here, so nothing organisational
  enforces this: it exists **only** as a blocking definition-of-done
  (`D_gate_is_dod`).
- **`tests-creator` runs before `task-implementer` on T-301 only.** Its test must
  be **observed red** against current code (TEST-3). Elsewhere red-first is
  optional; here it is the acceptance criterion — the finding *is* the missing
  assertion.
- **`code-verifier` gate for every task**: `bun run check` is the only gate; `bun
  test` is the only runner; **zero mocking libraries** in any new test (TEST-1) —
  real `serve()` on `port: 0`, real `StreamableHTTPClientTransport`, real
  `Bun.spawn`. `mockInput` from `@opentui/core/testing` is a keyboard driver and
  is permitted.
- **A standing review rejection**: any acceptance test that asserts a
  configuration value where an effect is observable — `enableDnsRebindingProtection
  === true`, "the schema no longer has the field", "the call happened" — is
  rejected regardless of whether it passes (SEC-3, TEST-12).

---

## New decisions recorded by this phase

| ID | Decision | Value | Rationale |
|---|---|---|---|
| `D_milestones` | Three milestones, seven tags | M1 = v0.5.0 · M2 = v0.6.0 · M3 = the patch stream (v0.5.1, v0.5.2, v0.6.1, v0.6.2, v0.6.3) | `D_release_shape` fixes the two minors; the stream carries the render work by name and the three items the ruling did not enumerate, none of which changes a published surface |
| `D_leak_n` | **N = 200** for the session-map criterion | `sessionCount === 0` after 200 clean cycles; `=== 1` mid-cycle; `=== 0` after one abandoned connection + one sweep | The map predicate is exact at any N, so N is chosen for continuity with the harness that recorded +18 MB / 200 cycles — the criterion refutes the original observation on its own configuration. The mid-cycle assertion exists because a counter that never increments would otherwise pass vacuously |
| `D_release_gate_two_increments` | **OWNER RULING: the gate ships in 0.5.0 on `--version`, and gains `--help` in 0.6.0** | **T-110 (M1)**: `release.yml:91` drops `\|\| true`, runs `roomyx --version`, asserts exit 0 **and stdout == `${GITHUB_REF_NAME#v}`**. **T-207 (M2)**: adds the `--help` → exit 0 assertion to the same step | Two increments to one step, not a deferral. The `\|\| true` hole is not about `--help`: `--version` exists since 0.4.0, exits 0 today, and the job already holds the tag in `GITHUB_REF_NAME`, so the gate can assert something *stronger* immediately — that the packed artifact runs and prints the version it was tagged as, an end-to-end property no current step checks. **Rejected alternative — `D_gate_lands_with_r8`, this plan's first answer**: ship the whole strengthening in 0.6.0 because `roomyx --help` exits 1 until R8, so asserting exit 0 in 0.5.0 would fail the security release on a defect that release does not contain. That reasoning is *correct about `--help`* and is why T-207 exists at all — but it was reasoning inside the assumption that the smoke step must be about `--help`, and it left the discarded exit code open for one more tag for no reason. Kept on the record so the next reader sees why the step is checked in two stages |
| `D_patch_stream_contents` | S3, R2 and R5's residual join the render work in the patch stream | v0.5.2, v0.6.1, v0.6.3 | `D_release_shape` enumerates only the two minors' contents; none of these three changes a published surface a minor exists to announce. `ServeHandle`'s session count is additive only and gets a `CHANGELOG.md` line |
| `D_g6_completion_date` | G6's binary target is measured at **v0.6.3** | Three of five sub-criteria at 0.5.0; all five at 0.6.3 | Closes W-009 by dating the goal instead of re-prioritising the story. The placement is `D_release_shape`'s, not a scheduling preference |
| `D_pkg8_binding` | PKG-8 is **binding (MUST)**, and its mechanism is fixed in T-205 | Stripped `PATH` + a local listener that records connection attempts | It is a `SHOULD` upstream and a hard checkbox in G5 and US-009 AC3. A criterion cannot be discretionary in one artifact and binding in the next; the plan resolves it upward, since G5's whole hard negative depends on it |
| `D_estimate_bands` | Realistic = the backlog size verbatim; the band is ×0.6 / ×2 | Two tasks marked **[unpriced]** carry plan-overhead bands instead | `D_no_reestimate` holds; the roadmap's format needs ranges, and a band around a fixed input is presentation, not re-estimation. The single ruled re-price remains US-012's |

---

| Key | Value |
|---|---|
| Created | 2026-09-09 |
| Agent | gproject-planner |
| Phase | 6 |
| Job | gproject-roomyx-backlog |
| Mode | task_in_project |
| Status | final — all six owner rulings applied; no open questions remain |
