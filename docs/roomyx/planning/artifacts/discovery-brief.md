# Discovery Brief: roomyx defect-remediation backlog (`@mrciphersmith/roomyx@0.4.0`)

Job: `gproject-roomyx-backlog` · Phase 0 · mode `task_in_project`
Repo root: `/home/altsay/roomyx` · branch `main`, clean at time of discovery

> `metaproject: unavailable` — `/home/altsay/roomyx/.metaproject/` exists but contains
> only `data/security/raw/`; there is no `index.md`, so the project-local routing gate
> in `/home/altsay/CLAUDE.md` cannot be honoured. Discovery proceeded with direct reads.

---

## Source Summary

- **User input:** turn a verified 15-item improvement backlog into an executable
  implementation plan. Findings are inputs, not outputs — no re-derivation, no
  re-testing, no new findings, no re-estimation.
- **Documents analyzed:**
  - `/home/altsay/roomyx/docs/roomyx/improvement-backlog.md` (primary input)
  - `/home/altsay/roomyx/README.md`
  - `/home/altsay/roomyx/docs/roomyx/decisions.md` (D-01..D-06)
  - `/home/altsay/roomyx/docs/roomyx-installer/decisions.md` (D-01..D-04)
  - `/home/altsay/roomyx/package.json`
  - `/home/altsay/roomyx/.github/workflows/ci.yml`, `release.yml`
  - `/home/altsay/roomyx/docs/roomyx/planning/decisions.md`, `state.json`
- **Codebase scanned:** yes — structural only (file inventory, LOC, `src/cli.ts:20-36`
  `parseFlags`, entry points). No behaviour re-verification: the backlog's findings are
  already reproduced against the published package and are treated as given.
- **Web research:** none. The task is fully specified by local artifacts; the one
  external fact the backlog depends on (SDK guard availability) was already verified in
  the backlog against the installed `@modelcontextprotocol/sdk@1.30.0` and is carried,
  not re-checked. Nothing in this brief rests on an uncited external claim.

---

## Project/Task Description

`roomyx` is a published npm package — an MCP server plus a terminal UI for the
`startup-room` multi-persona discussion framework. It reads a room's append-only JSONL
log and exposes roster, goal contract, transcript and per-agent detail both as MCP tools
and as a live TUI, plus a room registry and a skill-sync path. It is at `0.4.0`, public
on npm under `@mrciphersmith`, installable today.

The work is **defect remediation on shipped software**, not a build. A five-participant
`startup-room` session on 2026-09-09 read the source, ran the binaries, and produced
fifteen deduped, reproduced findings — every one a place where shipped code behaves
differently from what the docs promise. Not one is a feature request. The session also
ranked five of them by weight, pulled four out of the ranking as "ship now", pulled one
out to position zero as owner-gated, and left four below the line as real-but-unscheduled.

The job of this pipeline is to convert that ordering into an executable plan without
losing what the ordering encodes. Three properties of the input are load-bearing and
survive into every downstream phase: **ranked order is not build order** (stated twice in
the source, with the failure mode named); **two items cannot start until a recorded
decision is amended by the owner**; and **several items change published behaviour**,
which makes them a compatibility event rather than a free change.

---

## Key Facts (confirmed)

### About the artifact under repair

- `@mrciphersmith/roomyx@0.4.0`, MIT, public, `publishConfig.access: public`.
  [source: `package.json`]
- Five released tags: `v0.1.0`, `v0.2.0`, `v0.2.1`, `v0.3.0`, `v0.4.0`.
  [source: `git tag`]
- Ships **TypeScript as source, no build step**. `bin.roomyx → ./src/cli.ts`,
  `bin.roomyx-client → ./src/client/index.ts`, both with `#!/usr/bin/env bun`.
  [source: `package.json:25-28`, `src/cli.ts:1`]
- Runtime dependency on Bun ≥1.1 declared in `engines.bun` and stated in bold at
  `README:18`. The backlog established (tested, not assumed) that `engines.bun`
  enforces nothing — npm's engine check only ever knew `node` and `npm`.
  [source: `package.json:52-54`, `README:16-21`, backlog R4]
- Dependencies: `@modelcontextprotocol/sdk ^1.0.0` (installed 1.30.0), `@opentui/core
  ^0.5.11`, `zod ^4.5.4`. Dev: eslint 10, typescript 5.6, typescript-eslint 8, @types/bun.
  [source: `package.json:41-51`]
- **Small codebase:** 23 TypeScript files under `src/`, ~2,122 lines total. The largest
  single file is `src/installer/registry.ts` (231). `src/client/screens/chat-view.ts` is
  59 lines; `src/client/components/message-row.ts` is 11.
  [source: `wc -l src/**/*.ts`]
- Test suite: 15 `bun test` files under `test/`, including `test/client/render.test.ts`
  (the suite the backlog identifies as certifying the frame and not the picture) and
  `test/cli-serve-lifecycle.test.ts` (the one R9 identifies as testing the unattached case).
- CI (`.github/workflows/ci.yml`): `bun install --frozen-lockfile` → `bun test` → `tsc
  --noEmit` → `eslint src test` → `bun audit`, on push-to-main and every PR.
- Release (`.github/workflows/release.yml`): tag-triggered only (`v*`), no
  `workflow_dispatch`; refuses a tag disagreeing with `package.json`; runs `bun run
  check`; packs, installs the tarball, smoke-tests; publishes via npm trusted publishing
  (OIDC, no token) with `--provenance`; creates a GitHub Release with generated notes.
- **S4 confirmed in place:** the release workflow's "Install dependencies" step is bare
  `bun install`, while CI uses `--frozen-lockfile`. [source: `release.yml`, `ci.yml`]
- **The release smoke test cannot catch R8.** It runs
  `./.release/prefix/bin/roomyx --help > /dev/null 2>&1 || true` — output discarded, exit
  code discarded. `roomyx --help` exiting 1 (backlog R8) is invisible to it.
  [source: `release.yml`, "Pack and smoke-test the artifact"]
- **There is no `CHANGELOG.md` in the repo.** Release notes are `gh release
  --generate-notes` off commit titles. [source: repo root listing, `release.yml`]
- Solo project: 22 commits by `MrCipherSmith`, 1 by `Aleksandr Tsaitler` — the same human
  under a second (work) git identity. [source: `git shortlog -sn --all`]

### About the backlog itself

- Fifteen findings, **all reproduced against the published package**; zero feature
  requests. Full transcript preserved at `docs/roomyx/rooms/2026-09-09-improvements/transcript.md` and
  `.jsonl`. [source: `improvement-backlog.md:1-12`, repo listing]
- **Two orderings, both explicit and non-identical:**
  - Build order: ship-now items → R3 → R4 → R8 → R2 → R1
  - Ranked by weight: R1, R2, R8, R4, R5
  R5 appears in the ranking but not in the stated build order; R3 appears in the build
  order but not in the ranking. Both facts are deliberate, not omissions.
- **Four tiers, not one list:**
  1. *Ship now* (S1–S4) — outside the ranked five, ahead of it. Cost under an afternoon
     each; the room's rule is that such work takes a commit, not a slot.
  2. *Position zero* (R3) — gated on the owner, not on an implementer.
  3. *The five, ranked by weight* (R1, R2, R8, R4, R5).
  4. *Below the line* (R7, R9, R10, R12) — real, reproduced, **not scheduled**.
  Plus *Already fixed* (the `testing-story.md` step-9 overclaim, corrected in place).
- **Sizes are the room's, argued over, and carried verbatim:**

  | Item | Size as recorded |
  |---|---|
  | S1 drop `targetPath` from `roomyx.skills.sync` | minutes |
  | S2 Origin/Host validation on both transports | an afternoon |
  | S3 route `init.ts:44` through `syncSkill` | an afternoon |
  | S4 `release.yml` bare `bun install` | one word |
  | R3 `roomyx room new\|append` | half a day + a half-hour decision edit |
  | R1 reading surface | ~3 days (re-priced up from 2.5 when R11 merged in) |
  | R2 healthy server called "disconnected" | ~1.5 hours + half a day |
  | R8 CLI argument grammar | ~2 days (re-priced when R13 merged in) |
  | R4 package cannot speak when it fails | half a day |
  | R5 session reaper + D-06 amendment | ~1 day, explicitly **minus** the S2 guard |
  | R7 liveness identity | afternoon + tool |
  | R9 SIGTERM with client attached | afternoon |
  | R10 `get_transcript` limit / caching | afternoon → 2 days |
  | R12 status bar drops the threshold | half a day |

- **Two decision gates, both amendments to `docs/roomyx/decisions.md`:**
  - **R3 → D-01 amendment**, and the backlog states it must be written **first**, in
    substantially these terms: *D-01 constrains the server, not the package; the invariant
    is one writer per live room; `room new` creates a log with no dispatcher (writers 0→1,
    no race); `room append` refuses when `listLiveRooms()` shows a live room serving that
    path; `--force` overrides.* Definition of done includes the amendment being in the file.
  - **D-06 amendment → S2's commit, not R5's.** Filed as a correction after the room
    closed: if the guard ships this week and the amendment stays bound to the residual R5,
    the code ships and the reasoning never does, and the next reader of D-06 still believes
    loopback binding excludes a browser.
- **A post-room correction changes S2's implementation, not just its schedule.** Verified
  against installed SDK 1.30.0: `enableDnsRebindingProtection` / `allowedHosts` /
  `allowedOrigins` exist in `server/sse.js` and `server/webStandardStreamableHttp.js` and
  **not once** in `server/streamableHttp.js`, which is what both roomyx servers construct.
  The fix is therefore not a constructor option — either validate `Origin`/`Host` in
  roomyx's own `createServer` handler before `transport.handleRequest`, or move to the
  web-standard transport. Note that R5's own acceptance criteria still say "the guard the
  SDK already ships" — **superseded by this correction**; downstream phases must not
  reintroduce the constructor-option framing.
- **Commit-shape instructions are part of the findings, not decoration:**
  - S1 gets its own commit and its own changelog line, deliberately not folded into
    another PR, so it cannot be reverted as collateral.
  - S1 and S2 ship in the same PR — same attack path.
  - S4 goes in another PR's description, not its own.
  - R1 must not merge without R2 (shipping R1 alone upgrades a wrong answer to a
    *credible* wrong answer).
  - R1 splits: the `chat-view.ts:36` fix is ~1 hour and independently shippable.
  - R9 rides along with R2 — same function, six lines apart.
  - R12 should inherit R1's wrap primitive rather than hand-roll a second one.
- **An intra-item order of work is recorded for R1** by the person who found it: start at
  `chat-view.ts:36` (the scroll model), not at `message-row.ts`'s `height: 1`, because
  wrapping bodies before fixing the sticky-bottom off-by-one makes the symptom worse. And
  write the failing test before either.
- **The room recorded a defect in its own scoring instrument.** All fifteen items cleared
  the 40/60 threshold; five of six criteria measure whether an item is *well-formed*, only
  criterion 3 measures whether it is *worth doing*. The rubric scores frequency and treats
  it as consequence, and has no axis for attacker-reachability. Flagged "worth fixing
  before the next room, not mid-flight" — i.e. **explicitly out of scope for this job**.
- **A dissent is on the record for R4** (its failure mode is the only one that is
  *documented*, at `README:18`; R1/R2/R8 bite the person who did everything right) and a
  **hard negative acceptance criterion**: the R4 launcher must never fetch, install or
  bootstrap Bun — it probes `PATH` and prints a URL. Grounded in installer D-01, which
  exists to refuse install-time network fetches.

### Published-surface changes (the compatibility event)

Three scheduled items change behaviour users can already depend on:

| Item | Published surface changed | Nature |
|---|---|---|
| S1 | `roomyx.skills.sync` MCP tool loses its `targetPath` input | removal of a documented input (`README:168`); CLI keeps its literal-path escape hatch |
| R8 | `roomyx serve` default port `4319` → `0` (ephemeral); `mcp` stays `4320` | default change; the backlog itself says it "needs a README note" |
| R4 | `bin.roomyx` / `bin.roomyx-client` become node-shebang launchers | shape change to both installed entry points; also fixes the broken Windows `.cmd` shim |

R8 additionally makes previously-silent inputs fail loudly (`--dryrun`, bare trailing
flags, `--port abc`), which is behaviour change for anyone who scripted around them.
`README:82` currently documents `4319` as `serve`'s default.

---

## Assumptions (need validation)

- **The owner and the implementer are the same person** (`MrCipherSmith`, sole npm scope
  holder and author of 22 of 23 commits), so the D-01/D-06 ratification gate is
  *procedural* — a required artifact and ordering — rather than a hand-off to a different
  human. — confidence: **high** (git + npm scope evidence), but the *consequence* matters:
  the gate must be enforced by the plan's definition-of-done, because nothing organisational
  will enforce it.
- **The installed user base is small and reachable-by-nobody-in-particular** — a 0.x
  package five tags old with no download data available offline. — confidence: **medium**.
  This is the single fact that determines whether the R8/R4/S1 surface changes need a
  deprecation cycle or just a minor bump plus README notes.
- **All ten scheduled items can land inside `0.5.0`** rather than being spread across
  several releases. — confidence: **low**; this is a plan decision, not a discovered fact.
- **Derived schedule arithmetic** (the room's own numbers, "afternoon" ≈ half a day, not a
  re-estimate): ship-now ≈ 1 day; R3 ≈ 0.5 day; the five ≈ 7.2 days → **~9 working days
  for the ten scheduled items**, plus ~2–3.5 days if the below-the-line four are ever
  pulled in. — confidence: **medium**; carried as arithmetic, explicitly not a commitment.
- **`bun audit` in CI is the only supply-chain gate**, and nothing in the backlog changes
  the dependency set. — confidence: **high**.

---

## Stakeholders & Users

- **Owner / approver:** `MrCipherSmith` — the only person who can amend
  `docs/roomyx/decisions.md`. Named approver for the D-01 amendment (gates R3) and the
  D-06 amendment (rides in S2's commit). Also the npm publisher; releases are OIDC-bound
  to the `MrCipherSmith/roomyx` workflow identity, so nobody else can ship a fix either.
- **Primary users (human):** developers running `startup-room` multi-persona sessions who
  install the package globally, run `roomyx serve`, and attach `roomyx-client` in a second
  terminal. They hit R1 (blank/clipped transcript), R2 (a healthy server called
  disconnected), R3 (no supported way to create the file `README:36` tells them to serve),
  R4 (a bare `execve` failure on a Node-only machine).
- **Primary users (non-human) — a discovery finding worth carrying:** the package is
  *designed* to be driven by an LLM agent. `docs/roomyx/testing-story.md` is a walkthrough
  in which an agent drives this CLI, and the management server exists to expose the
  installer surface to any MCP client. This changes the weight of two items:
  - R8: "the first thing any agent does with an unknown command is `--help`" — and
    `roomyx serve --help` **starts a server and mints a room id**.
  - R10: the consumer of `get_transcript` on the management path *is* a language model, so
    3.8 MB in one text block "isn't 20 ms of CPU, it's a context window".
- **Adversary (exactly one item has one):** a web page in a browser the operator happens to
  have open. R5/S2 is the only finding where the actor is not the operator and the
  operator's sole contribution is having a browser running. Every other item requires the
  operator to do something to themselves.
- **Secondary:** MCP client authors embedding `serveManagement` from
  `src/mcp-management/server.ts` — the one group for whom S1's `targetPath` removal is a
  breaking API change rather than a security fix.
- **Downstream of the docs:** anyone reading `docs/roomyx/decisions.md` later. Two of the
  gates exist purely to serve this reader — "an argued exception that lives in a room
  transcript isn't an argued exception, it's a rumour."

---

## Existing Context

- **Tech stack:** TypeScript (ESM, `"type": "module"`), Bun runtime and test runner,
  `@modelcontextprotocol/sdk` StreamableHTTP transport, `@opentui/core` for the TUI, zod
  for schema validation. No bundler, no transpile, no `dist/`.
- **Architecture (five subsystems, all under `src/`):**
  - `src/cli.ts` (208 LOC) — the `roomyx` binary: `init` / `serve` / `rooms list` / `mcp` /
    `skills sync` / `client`. Home of `parseFlags` (R8), `shutdown()` (R9), `pid` write (R7).
  - `src/server/` — per-room MCP server (`serve.ts`, `index.ts`, `tools/`), four tools.
  - `src/mcp-management/server.ts` (175 LOC) — the second, standalone MCP server exposing
    `roomyx.rooms.list` and `roomyx.skills.sync` (S1's target).
  - `src/client/` — the TUI: `index.ts` (key bindings, R1), `mcp-client.ts` (R2),
    `screens/chat-view.ts` (R1's scroll model), `components/message-row.ts` (R1's
    `height: 1`), `components/status-bar.ts` (R12).
  - `src/installer/` — `init.ts` (S3), `registry.ts` (R7, liveness + lockfile),
    `skill-sync.ts`, `skill-targets.ts`, `resolve-connection.ts`.
  - `src/log/store.ts` — the append-only JSONL reader (R2's bare `JSON.parse`, R10's
    re-read-and-revalidate-per-call).
  - `src/cli/seed.ts` — the only tool that creates a room log; **not in `bin`**, zero
    mentions in the README (R3).
- **Existing patterns the work must follow:**
  - Decisions are recorded in numbered `D-NN` sections with *решение / причина / отвергнутая
    альтернатива* — in Russian. Amendments must match that shape and language register.
  - Two separate decision registries (`docs/roomyx/`, `docs/roomyx-installer/`) with
    independent numbering; both D-01s exist and mean different things. Any plan text saying
    "D-01" must qualify which.
  - `existsSync`-guard-before-write is the established safety pattern in `init.ts` — S3 is
    literally "make line 44 do what lines 40 already do."
  - Backup-before-write plus `lastSyncedHashes` recording is the skill-sync safety
    contract (`README:183-196`).
  - Registry writes go through an exclusive lockfile with an owner token and
    write-to-temp-then-rename.
  - Tests live in `test/` mirroring `src/`, run under `bun test`, with fixtures in
    `test/fixtures/`.
  - Commit messages in this repo are sentence-form statements of effect ("Stop crashing in
    a project that hasn't been initialized"), not conventional-commit prefixes.

---

## Constraints Identified

1. **Published-package constraint.** Users can `npm install -g @mrciphersmith/roomyx`
   today. S1, R8 and R4 change behaviour that is currently documented in the README. This
   is a compatibility event: it needs a version decision, README edits, and release notes —
   not just code.
2. **Owner-ratification gate, twice.** R3 cannot start before the D-01 amendment is in
   `docs/roomyx/decisions.md`; the D-06 amendment must land *inside S2's commit*. Both are
   the owner's act. A plan that lists them as tasks assigned to an implementer has
   misunderstood the input.
3. **Sequencing is prescribed, not derivable.** Build order (ship-now → R3 → R4 → R8 → R2 →
   R1) is given and differs from the weight ranking. R1 must not merge without R2. R9 rides
   with R2. S1+S2 ship together. S1 keeps its own commit. R1 starts at `chat-view.ts:36`.
4. **Sizes are fixed.** The room argued over them, including two documented re-pricings
   (R1 2.5→3 days when R11 merged in; R8 re-priced when R13 merged in) and one downward
   re-price that cost an item its slot. Downstream phases carry them; they do not re-estimate.
5. **Scope is closed at fifteen.** No new findings. The four below-the-line items are
   *recorded as not scheduled* — a plan that quietly promotes them contradicts the input.
6. **Runtime constraint, hard.** No build step; TypeScript stays the source of truth. R4's
   launcher must be hand-written, node-shebanged, and must never fetch or bootstrap Bun
   (installer D-01).
7. **No release channel other than a tag.** `workflow_dispatch` is deliberately absent;
   every fix reaches a user only via a `v*` tag matching `package.json`.
8. **Team of one, unstated timeline.** No budget, no deadline, no second implementer is
   mentioned anywhere in the inputs. Parallelisation across people is not available;
   parallelisation across independent PRs is.
9. **Out of scope, explicitly:** repairing the room's scoring rubric ("worth fixing before
   the next room, not mid-flight"), and the `testing-story.md` step-9 overclaim (already
   fixed, with the note that making the second refusal genuinely separate would be a code
   change — i.e. a *future* item, not one of the fifteen).

---

## Open Questions

1. **Is the D-01 amendment text ratified as drafted?** The backlog supplies substantially
   the wording. — impacts: whether R3 is a half-day task or a half-day task behind an
   unbounded wait; whether position zero can be scheduled at all.
   *Options: (A) owner ratifies the backlog's draft as-is and R3 proceeds; (B) owner
   redrafts, plan holds R3; (C) plan produces both amendments as reviewable diffs for the
   owner to sign; (D) defer R3 past the ranked five.*
2. **What version does the compatibility event carry, and does it announce itself?**
   S1 + R8 + R4 all change published surface. — impacts: release structure, README edits,
   whether the plan needs a deprecation step.
   *Options: (A) one `0.5.0` carrying everything, README notes, no deprecation (0.x
   convention); (B) S1 alone as a fast `0.4.1` security patch, the rest in `0.5.0`;
   (C) stagger each surface change across its own minor; (D) hold all surface changes for
   a `1.0.0`.*
3. **How many people are actually running 0.4.0?** No download data was available offline.
   — impacts: assumption 2 above, and therefore question 2's answer.
4. **Where does S1's changelog line go?** The backlog requires S1 to have "its own
   changelog line," and **no `CHANGELOG.md` exists** — release notes are auto-generated
   from commit titles. — impacts: whether the plan must create a changelog as part of S1,
   or whether "changelog line" is satisfied by a dedicated commit title feeding
   `--generate-notes`.
5. **Should the release smoke test be strengthened alongside R8?** It currently discards
   `roomyx --help`'s output and exit code (`|| true`), so the exact defect R8 fixes is
   invisible to the release gate. Not one of the fifteen; adjacent to R8's acceptance
   criteria. — impacts: whether the plan may touch it without expanding scope.
6. **Does the R8 parser unification cover `src/cli/seed.ts:17`** given that R3 may replace
   seed.ts with `roomyx room new`? R8 names three divergent copies including seed's; R3 may
   delete or supersede one of them. — impacts: build-order coupling between R3 and R8 that
   neither item states.

---

## Confidence Assessment

- **Overall completeness: high.** The primary input is unusually well-specified: findings
  reproduced, sizes argued and recorded, orderings stated twice with the failure mode of
  misreading them named, commit shapes prescribed, dissents and self-corrections preserved.
  Discovery mostly consisted of *not losing* things.
- **High confidence:** what the fifteen items are; their sizes; both orderings; the two
  decision gates and which commit each amendment belongs to; which items change published
  surface; the stack, architecture, and file-level locations; the release mechanics.
- **Medium confidence:** the real-world blast radius of the surface changes (no download
  data); the aggregate schedule (derived arithmetic over the room's numbers).
- **Low confidence / genuinely undetermined:** release packaging strategy; whether the
  owner will ratify the drafted amendments as written; whether R3 and R8 collide over
  `seed.ts`.
- **Areas needing more data:** questions 2, 3 and 4 above — all owner-policy, none of them
  blocking Phase 1 (problem definition), all of them shaping Phase 6 (planning).

---

## Routing Audit

- `graph_used`: no — `.metaproject/index.md` absent, gdgraph unavailable.
- `wiki_used`: no — gdwiki unavailable for the same reason; `docs/roomyx/` read directly.
- `ctx_used`: no — `keryx` CLI not routed (metaproject unavailable).
- `raw_rg_used`: yes, twice — one `grep -rn` for `listLiveRooms|isRoomLive` and one
  `wc -l`/`find` inventory. Reason: the mandated `keryx ctx rg` route depends on the
  metaproject index, which does not exist in this repo. Recorded as required.
- Files read: listed in Source Summary. **Nothing in the repository was modified.**
