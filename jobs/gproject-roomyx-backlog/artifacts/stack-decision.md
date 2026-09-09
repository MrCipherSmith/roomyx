# Stack Decision: roomyx 0.4.0 defect remediation

Job: `gproject-roomyx-backlog` · Phase 2 · mode `task_in_project`
Inputs: `artifacts/problem-statement.md` (Phase 1), `ai/context.md` (codebase map), `package.json`

> `metaproject: unavailable` — carried forward from Phase 0/1.

---

## 0. What this phase is, and what it is not

`@mrciphersmith/roomyx@0.4.0` is published, installable and working. **There is no
stack to choose.** The stack is settled, inherited, and out of scope for
re-litigation — `D_mode = task_in_project`, `NG3` (no re-derivation), `NG4` (no
features), `NG5` (no build step).

This document therefore does three things and deliberately does not do a fourth:

1. **Records the inherited stack as fact**, at installed versions.
2. **Fixes the project level**, to set the process bar per fix.
3. **States the constraints that bind every fix in this backlog** — this is the
   real output of the phase.
4. It does **not** propose alternatives to any existing technology, and does not
   re-price anything. The skill's default "2–3 options per layer with trade-off
   analysis" shape is **suppressed** here by `D_mode` and `NG3`. Where this
   document names a version change, it is a *floor* on an already-chosen
   dependency, not a technology choice.

---

## 1. Project Level

### Level: **Published solo-maintainer 0.x developer tool** — *not* MVP, *not* production-with-SLA

The skill's four-way matrix (MVP / Pet / Startup / Production) does not have a
cell for this project, so forcing it into one would misstate the bar. Scored
honestly against the matrix axes:

| Factor | roomyx's actual value | Nearest matrix cell |
|---|---|---|
| Users | unknown, assumed small; **no download data available** (A2) | MVP/Pet |
| Team | 1 (`MrCipherSmith`, 22 of 23 commits, sole npm scope holder) | Pet |
| Lifespan | indefinite; 5 tags shipped | Pet |
| Budget | zero | Pet |
| Uptime SLA | **none** — there is no service; it is a local CLI + loopback server | Pet |
| Data sensitivity | low in aggregate, **but** room transcripts are private and P6 exfiltrates them | — |
| Compliance | none | Pet/MVP |
| **Distribution** | **npm public registry, OIDC trusted publishing, `--provenance` signed** | **Production** |
| **Reversibility** | **low** — published tarballs are immutable; consumers already installed 0.4.0 | **Production** |

**Rationale.** On every *team, budget, uptime and compliance* axis this is a pet
project. On the two axes that actually govern this backlog — **distribution and
reversibility** — it behaves like a production artifact. A defect ships to
strangers through a signed, immutable channel that the maintainer cannot recall.
That asymmetry, not a headcount, is what sets the bar.

### What the level licenses, and what it does not

The level is the *ceiling on process*, and for most of this backlog it is a low
ceiling:

- **No RFC, no design review, no ADR-per-fix, no staged rollout, no feature
  flags, no observability work, no migration tooling** (`NG6`). A one-line fix
  gets a one-line commit.
- **No re-estimation, no re-derivation** (`NG3`). Sizes are fixed inputs.
- Ordinary fixes carry exactly: a failing test first where the finding is
  behavioural, the fix, and the doc edit it invalidates.

**Three named exceptions where the bar is high regardless of level**, because
they are the axes where this project is production-shaped:

| Exception | Why the bar rises | Binding artifact |
|---|---|---|
| **Security surface** (S1, S2, R5) | one real adversary (P6); a signed release distributes the defect | guard's *effect* asserted, not its config; D-06 amendment in S2's commit |
| **Published surface** (S1, R8, R4) | immutable tarballs, consumers already on 0.4.0 | version decision + README edits + release notes (§5) |
| **The two decision amendments** (G8) | owner == implementer, so nothing organisational enforces the gate (A1) | binary definition-of-done, not a checklist line |

Everything else in the backlog is pet-level process. Stating that explicitly is
the point: the level exists to stop this remediation from growing a governance
apparatus it cannot staff (`NG9` — team of one).

---

## 2. Inherited Stack — recorded as fact

Every version below was read from the resolved install tree
(`node_modules/*/package.json`, `bun.lock`) and the live toolchain, not from the
declared range. **Declared vs. resolved divergence is called out where it exists**,
because one such divergence (`@modelcontextprotocol/sdk`) is a live security
hazard (A6) and another (`engines.bun`) is a documented non-constraint (P5).

### 2.1 Runtime & language

| Layer | Choice | Declared | Installed / observed | Divergence |
|---|---|---|---|---|
| Runtime | **Bun** | `engines.bun >=1.1.0` | **1.3.11** | **Declared range enforces nothing.** npm's engine check knows only `node`/`npm`; a package declaring `engines.bun >=99.0.0` installs under `--engine-strict` with exit 0. This is P5's "comment that looks like a constraint". |
| Language | **TypeScript** | `^5.6.0` (dev) | **5.9.3** | in-range |
| Module system | **ESM** (`"type": "module"`), `moduleResolution: "bundler"` | — | — | — |
| Type strictness | `strict: true` **+ `noUncheckedIndexedAccess: true`** | — | — | binds new parser/scroll code (§3.7) |
| Node (launcher target only) | **node** | not declared | 24.14.0 present | R4 introduces a node dependency for the launcher **only**; see §3.2 |

### 2.2 Shipped artifact

| Property | Value |
|---|---|
| Build step | **none** |
| Shipped artifact | **`src/*.ts` — TypeScript source, executed directly by Bun** |
| `files` | `["src", "LICENSE", "README.md", "package.json"]` |
| `bin` | `roomyx → ./src/cli.ts`, `roomyx-client → ./src/client/index.ts` |
| Shebang (current) | `#!/usr/bin/env bun` in `src/cli.ts`, `src/client/index.ts`, `src/cli/seed.ts` (all three verified) |

### 2.3 Dependencies

| Package | Declared | **Resolved** | Divergence / note |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | `^1.0.0` | **1.30.0** | **Widest and most dangerous gap in the tree.** `^1.0.0` admits 1.0.0–1.30.0; the security guard S2 relies on does not exist below 1.13.3 and does not behave the same below 1.25.0. Full analysis in §4. |
| `@opentui/core` | `^0.5.11` | **0.5.11** | exact; caret on `0.x` is minor-locked by npm semantics |
| `zod` | `^4.5.4` | **4.5.4** | exact |
| `@types/bun` (dev) | `^1.4.2` | 1.4.2 | exact |
| `eslint` (dev) | `^10.10.0` | 10.10.0 | exact |
| `typescript-eslint` (dev) | `^8.0.0` | **8.70.0** | wide but low-risk (dev-only, lint) |
| `typescript` (dev) | `^5.6.0` | **5.9.3** | wide but low-risk (dev-only) |

Transitively the SDK pulls `express`, `hono`, `@hono/node-server`, `cors`, `jose`,
`ajv` — the tree `bun audit` runs over in CI.

### 2.4 Transport, TUI, validation

| Layer | Choice | Version | Where it lives |
|---|---|---|---|
| Transport | **MCP Streamable HTTP over loopback**, no auth token (D-06) | SDK 1.30.0 | `src/server/serve.ts`, `src/mcp-management/server.ts` |
| Session model | one transport + one `McpServer` per session; **one `initialize` per transport lifetime** | — | do not collapse (SDK contract) |
| TUI | **`@opentui/core`** | **0.5.11** | `src/client/screens/`, `src/client/components/` |
| Schema validation | **zod** | **4.5.4** | log lines, registry file, MCP `inputSchema` (plain object of validators, **not** `z.object({...})`) |

### 2.5 Test, lint, CI, release

| Layer | Choice | Notes |
|---|---|---|
| Test runner | **`bun test`** (`bun:test`) | 17 test files, ~1845 lines; explicit imports, no globals |
| Test style | **real servers, real SDK clients, real `Bun.spawn` subprocesses** | **zero mocking libraries — verified** (§3.5) |
| Renderer tests | `@opentui/core/testing` `createTestRenderer` | `renderOnce`, `captureCharFrame`, `waitForFrame`, `mockInput` |
| Lint | `eslint` 10.10.0 + `typescript-eslint` recommended | `no-require-imports`, `no-unused-vars` with `^_` ignore |
| Gate | `bun run check` = `lint && typecheck && test` | CI adds `bun audit` |
| CI | `.github/workflows/ci.yml` — `bun install --frozen-lockfile` | push to `main` + every PR |
| Release | `.github/workflows/release.yml` — **tag `v*` only, no `workflow_dispatch`** (`NG7`) | `bun install` **bare** — this is **S4** |
| Publish | `npm publish --provenance --access public`, **OIDC trusted publishing, no token** | registered for `MrCipherSmith/roomyx` + `release.yml` — **renaming that workflow file breaks publishing** |
| Changelog | **none — `CHANGELOG.md` does not exist**; notes are `gh release create --generate-notes` from commit titles | S1 is required to have "its own changelog line" with nowhere to put it (P8) |

**Complexity budget: 0 new technologies.** Nothing is added. One dependency
*floor* rises (§4). Team learning required: none.

---

## 3. Constraints That Bind Every Fix

These are the operative output of this phase. Each is stated as a rule, with the
evidence that establishes it and the items it binds.

### C1 — No build step. `src/*.ts` is the shipped artifact.

**Rule.** Nothing is transpiled. No `dist/`. No bundler. Shipped TypeScript stays
the source of truth (`NG5`). Any new file a fix introduces must be either
Bun-executed TypeScript under `src/`, or (for R4 only) a hand-written launcher —
and must land **inside `src/`**, because `files` ships only `src`, `LICENSE`,
`README.md`, `package.json`.

**Status of this rule — important.** This is **README prose, not a recorded
decision.** Verified: a grep of *both* decision registries
(`docs/roomyx/decisions.md`, 47 lines; `docs/roomyx-installer/decisions.md`,
33 lines) for `build`, `transpil`, `shebang`, `bun`, `dist/` returns **zero
matches in either file**.

**Consequence.** No carve-out or decision amendment is needed to change the
launcher's shape — there is no decision to except. R4 needs a **doc edit**
(`README.md:18–19`), not a D-NN amendment. Conversely: nothing in the register
protects the no-build-step stance either, so if a future item wants a build step
it will not be blocked by the register — only by `NG5`, which is scoped to this
project.

**Binds:** R4, R3, and any fix adding a file.

### C2 — The `bin` launcher: node shebang, and never a network fetch.

**Rule, two parts, both hard:**

1. The launcher uses a **`#!/usr/bin/env node` shebang** — because a shebang is
   an `execve` dispatch handled by the kernel and has no slot for a diagnostic
   (P5). Node is the only interpreter npm can assume is present.
2. The launcher **must never fetch, install or bootstrap Bun.** It probes `PATH`,
   and on failure prints a diagnostic naming the missing runtime plus an install
   URL, and exits 1.

**Why part 2 is not negotiable.** Installer **D-01** — `init` is an explicit
command, never a postinstall hook, **no install-time network** — exists precisely
to refuse this. An install-time or first-run network fetch is the thing that
decision was written to say no to. G5 states it as a hard negative criterion:
*"we made the error message nicer by downloading a runtime" would be the single
worst trade available*.

**Measurement.** Run under a `PATH` without `bun`, **with network egress
observed**: stderr non-empty and mentioning Bun, exit code 1, **0 network calls**.

**Mechanical note.** `import.meta.dir` / `import.meta.main` are used at
`cli.ts:47,174` and `client/index.ts:132`. The node launcher must **`exec` bun**,
not attempt to run those modules under node.

**Binds:** R4 (and the release smoke step, §5).

### C3 — SDK floor: a version range decision, resolved in §4.

`@modelcontextprotocol/sdk` is declared `^1.0.0` and resolves 1.30.0. Raising the
declared floor is **part of S2's definition of done** (`D_sdk_floor`), not a
footnote. The guard **is** a constructor option and **does** reach the transport
roomyx constructs (`D_sdk_guard_reaches` — the earlier contrary claim is
retracted). The remaining question is *which floor*, and it is answered in §4
with measured evidence.

**Binds:** S2, R5.

### C4 — Every transport change is two files, or an extraction first.

**Rule.** `src/server/serve.ts` (102 lines) and `src/mcp-management/server.ts`
(175 lines) are ~90% duplicated. Any transport-level change lands in **both**, or
the shared shape is extracted once and both call it (`D_transport_duplication`).

Duplicated concerns, with line anchors:

| Concern | `server/serve.ts` | `mcp-management/server.ts` |
|---|---|---|
| Loopback host set | `:6` | `:99` |
| Non-loopback refusal | `:36–41` | `:111–116` |
| `sessions` map | `:43` | `:118` |
| `createSession()` | `:45–58` | `:120–133` |
| `createServer` handler | `:60–74` | `:135–147` |
| Default port | `:76` (`4319`) | `:149` (`4320`) |
| `close()` | `:93–101` | `:166–174` |

**Blast radius of an extraction:** four test suites construct these servers —
`test/server/serve.test.ts`, `test/mcp-management/server.test.ts`,
`test/cli-commands.test.ts`, `test/installer/registry.test.ts`.

**The Origin/Host guard (S2) belongs in that shared handler, before
`transport.handleRequest`.** So does R5's unknown-session-id 404: both handlers
currently reuse a known `mcp-session-id` and otherwise call `createSession()`
**unconditionally**, minting an orphan transport that never enters `sessions`
(because `onsessioninitialized` fires only on a real `initialize`) and can
therefore never be closed.

**Binds:** S2, R5, and R7/R10 if ever scheduled.

### C5 — The render work is a state machine, not new primitives.

**Rule.** `@opentui/core@0.5.11` already ships everything R1 needs. Nothing is to
be hand-rolled. **Verified in the installed package:**

| Need | Primitive | Location (verified) |
|---|---|---|
| Body wrapping | `wrapMode?: "none" \| "char" \| "word"` (default `"none"`), `truncate?: boolean` | `renderables/TextBufferRenderable.d.ts:17,20` |
| Scroll position | `get/set scrollTop` | `renderables/ScrollBox.d.ts:69–70` |
| Scroll by delta | `scrollBy(delta, unit?: ScrollUnit)` | `ScrollBox.d.ts:80–83` |
| Absolute scroll | `scrollTo(position)` | `ScrollBox.d.ts:85` |
| Sticky-bottom | `get/set stickyScroll`, `stickyStart` | `ScrollBox.d.ts:26,65–66` |
| Page units | `ScrollUnit = "absolute" \| "viewport" \| "content" \| "step"` | `ScrollBar.js` via `ScrollBox.d.ts:8` |

**Consequences for R1:**
- Removing the hardcoded `height: 1` in `message-row.ts` and setting
  `wrapMode: "word"` **is** the wrapping mechanism.
- `scrollBy(±1, "viewport")` is the natural PgUp/PgDn; `"step"` gives half-pages.
- `stickyScroll` internally tracks `_hasManualScroll` / `isAtStickyReengagePoint`
  — the "suspend sticky while scrolled up, resume at bottom" behaviour that
  `testing-story.md:171` promises **may be partly free. Test before
  reimplementing.**
- `ChatView.scroll` is **private**; `statusBar` and `roster` are public readonly.
  A scroll-key API must be **added to `ChatView`**, not reached into.
- R12, if ever scheduled, **inherits this same wrap primitive** rather than
  writing a second one (`NG1`).

**The work that remains is a state machine** — which is what the codebase
convention prescribes anyway: pure state machines are extracted and unit-tested
separately (`src/client/owner-prompt.ts` ← `test/client/owner-prompt.test.ts`).
R1's scroll state machine follows that pattern.

**Order within R1 is prescribed, not derivable:** `chat-view.ts:36` (the scroll
model) **before** `message-row.ts` (`height: 1`) — wrapping bodies before fixing
the sticky-bottom off-by-one makes the symptom worse. The failing seq-1 test
comes before either. The `chat-view.ts:36` fix is ~1 hour and **independently
shippable**.

**Binds:** R1 (and R12's future shape).

### C6 — Tests: real servers, real subprocesses, zero mocking libraries.

**Rule.** New tests follow the existing style. **Verified:** a grep of `test/` for
`vi.fn`/`vi.mock`, `jest.fn`/`jest.mock`, `sinon`, `proxyquire`, `testdouble`,
`spyOn` and bare `mock(` returns **zero matches**. No mocking library is used
anywhere (`D_no_mocking`).

> Note to avoid a false positive: `mockInput` in `test/client/render.test.ts` is
> `@opentui/core/testing`'s **keyboard driver** (`createMockKeys`), not a mocking
> library. It supplies `pressArrow`, `pressEnter`, `pressEscape` today; other key
> presses are available for R1's PgUp/PgDn tests.

**Conventions new tests must match:**
- `import { afterEach, describe, expect, test } from "bun:test"` — explicit
  imports, no globals; `describe` → `test`, one level.
- Real `serve()` on `port: 0`; real `StreamableHTTPClientTransport`; real
  `Bun.spawn` subprocesses.
- Temp dirs via `mkdtempSync(join(tmpdir(), "roomyx-…-"))`, cleaned in
  `afterEach` with `rmSync(dir, { recursive: true, force: true })`.
- Handles tracked in module-level `let activeHandle` / `procs[]`, closed in `afterEach`.
- Subprocess timing uses poll-until-deadline helpers (`waitForRegistration`,
  `waitForStdout`) — **not fixed sleeps**; per-test timeout as `test()`'s 3rd argument.
- Test names state the AC/finding in parentheses: `(AC3)`, `(regression, real
  subprocess concurrency)`.
- Render tests: `createTestRenderer({ width, height })` → `renderOnce()` +
  `captureCharFrame()`. `waitForFrame(frame => frame.includes(body))` is the
  natural R1 assertion.

**Two assertions this rule makes non-negotiable:**
- **R1's test must FAIL when seq 1 is not drawn** — write it against current code
  first and watch it go red. Not a test asserting a body is drawn; a test that
  fails (G1).
- **S2's test must assert the guard's EFFECT** — an actual `403` / JSON-RPC
  `-32000` from a real cross-origin request — **not** the presence of
  `enableDnsRebindingProtection` in a config object (G6e). A config assertion
  would pass identically on an SDK where the option no-ops, which is the exact
  failure A6 warns about.

**Known test couplings:**
- `test/mcp-management/server.test.ts:81` asserts the "neither target nor
  targetPath" error message — **that test changes with S1.**
- `test/cli-serve-lifecycle.test.ts:43–61` tests only the **unattached** case;
  R9's documented case needs a client connected before SIGTERM.

**Binds:** every item.

### C7 — Decisions are Russian, `D-NN`-shaped, and live in two registries that both have a `D-01`.

**Rule.** Amendments match the register's established shape and language:
`## D-NN: <заголовок>` with **Решение / Причина / Отвергнутая альтернатива**
(Russian prose). Verified against both files.

**The `D-01` collision is real and must be disambiguated in writing:**

| File | `D-01` is | Bears on |
|---|---|---|
| `docs/roomyx/decisions.md:7` | «MCP-сервер только читает состояние и принимает команды; лог по-прежнему пишет только диспетчер» | **R3 gate** |
| `docs/roomyx-installer/decisions.md:7` | «`roomyx init` — явная команда, не npm postinstall-хук» | **R4 hard criterion (C2)** |

Every reference to "D-01" in a commit, test name or doc **must name which file**.
Two different D-01s bind two different items in this backlog, and they mean
entirely different things.

**The two amendments, with prescribed placement (G8, binary DoD):**
- **roomyx D-01 amendment** → written into `docs/roomyx/decisions.md` **before R3
  work begins**. Content: D-01 constrains the *server*, not the *package*; the
  invariant is one writer per live room; `room new` takes writers 0→1;
  `room append` refuses when `listLiveRooms()` shows a live room on that path,
  `--force` overrides.
- **roomyx D-06 amendment** → lands **inside S2's commit**, not R5's. Content:
  loopback binding does **not** constrain a browser; D-06's threat model
  enumerated process actors and never enumerated browsers; the remedy is the
  rebinding guard, not the auth D-06 deferred.

**Also binding:** *comments carry decisions* in this codebase — nearly every
non-obvious block has a paragraph explaining **why**, often naming `D-01`/`D-06`
or the review that found the bug. Fixes extend that; they do not strip it.

**Binds:** R3 (gated), S2 (carries D-06), R5, and the definition-of-done itself.

### C8 — Codebase conventions that constrain new code

| Convention | Rule |
|---|---|
| `noUncheckedIndexedAccess` | `arr[0]` is `T \| undefined` **everywhere**. Naive `args[i]` parser code **will fail `bun run typecheck`**. Existing code uses `as [string, ...string[]]` (`log/store.ts:57`), `?? fallback`, `as RoomRegistryEntry`. New parser (R8) and scroll (R1) code must do the same. |
| Imports | `node:*` builtins first, then third-party, then relative. Types via `import type`. |
| Errors | Messages, not objects, at the CLI boundary. **Error strings name the file path** — `store.ts:58`'s bare `JSON.parse` is the one place that doesn't, and that is R2's. |
| Exit | `process.exit(1)` after `console.error` for user error; **usage currently goes to stderr** (half of P3 — R8 moves `--help` to stdout/exit 0). |
| Zod | Schemas at module top, `safeParse` + explicit throw with a human-readable message. **Never a bare `.parse()`.** MCP `inputSchema` is a **plain object of validators**, not `z.object({...})`. |
| FS writes | write-temp-then-rename (`registry.ts:126–130`); backup-before-overwrite (`skill-sync.ts:83–86`). **S3 exists because `init.ts:44` opts out of exactly this.** |
| Renderables | One `Renderable` per row, rebuilt wholesale on data change; `node` exposed readonly plus a small imperative API (`setRoster`, `setNotice`, `show`/`hide`). |
| `ConnectionStatus` | Three-value union consumed by an **exhaustive record lookup** at `status-bar.ts:40`. R2's pane-state work likely widens it — that breaks the lookup **silently at runtime** and loudly under `strict`. Ripples to `chat-view.ts:40`. |

### C9 — Release-shape constraints inherited, not chosen

- **`v*` tag is the only release trigger.** `workflow_dispatch` is deliberately
  absent (`NG7`). Remediation changes *what* ships, not *how*.
- **Do not rename `release.yml`.** OIDC trusted publishing is registered for
  `MrCipherSmith/roomyx` + that exact filename. Renaming it breaks publishing.
- **S4 is one word**: release-job `bun install` → `bun install --frozen-lockfile`,
  matching CI. Until then the release job can resolve a tree CI never tested and
  ship it **with provenance attached** — provenance attesting to an untested
  dependency set. **This interacts directly with §4**: a raised SDK floor is only
  meaningful if the release job installs the tree CI tested (A7).

---

## 4. The `@modelcontextprotocol/sdk` floor — measured, not guessed

**Task instruction:** determine the earliest version in which
`StreamableHTTPServerTransport` forwards options to the web-standard transport,
and make that the floor; if it cannot be determined offline, say so and file it
as a task rather than guessing.

**It was determined — empirically, not from memory.** The npm registry was
reachable, so 30 published tarballs were downloaded and their compiled
`dist/esm/server/*.js` inspected directly. This is version-specific evidence read
out of the artifacts consumers actually install.

### 4.1 Method

For each version: fetch `https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-<v>.tgz`,
untar, and inspect `dist/esm/server/streamableHttp.js` and
`dist/esm/server/webStandardStreamableHttp.js` for (a) existence, (b) the
`WebStandardStreamableHTTPServerTransport` forwarding call, (c) `enableDnsRebindingProtection`
and its enforcement path. Versions probed: 1.0.0, 1.5.0, 1.8.0, 1.10.0, 1.12.0–1.12.3,
1.13.0–1.13.3, 1.14.0, 1.15.0, 1.16.0, 1.17.0, 1.17.5, 1.18.0, 1.19.1, 1.20.0,
1.21.0, 1.21.2, 1.22.0, 1.23.0, 1.23.1, 1.24.0–1.24.3, 1.25.0–1.25.3, 1.26.0,
1.27.0, 1.27.1, 1.28.0, 1.29.0, 1.30.0.

### 4.2 Three thresholds, not one

The measurement found that **the question has three different answers**, and the
distinction is load-bearing:

| # | Threshold | Version | What changes |
|---|---|---|---|
| **T1** | Guard first **exists and is enforced** | **1.13.3** | `enableDnsRebindingProtection` / `allowedHosts` / `allowedOrigins` implemented **directly in `streamableHttp.js`**, enforced by `validateRequestHeaders()` called from `handleRequest` before method dispatch, answering **403 / `-32000`**. Absent in 1.13.2 and everything below. |
| **T2** | Origin semantics become **lenient** | **1.24.0** | Origin check changes from `if (!originHeader \|\| !allowed.includes(originHeader))` to `if (originHeader && !allowed.includes(originHeader))`. |
| **T3** | **Forwarding to web-standard** (the version asked about) | **1.25.0** | `StreamableHTTPServerTransport` becomes a thin wrapper: `this._webStandardTransport = new WebStandardStreamableHTTPServerTransport(options)`; options type becomes a direct alias. Guard moves to `webStandardStreamableHttp.js`. |

**Continuity verified:** every probed version from **1.13.3 through 1.30.0**
enforces the guard, in one file or the other. There is no gap. (1.19.0 was never
published; 1.19.1 is the 1.19 line.)

**Chronology note:** 1.13.3 shipped 2025-07-01, before 1.14.0 (2025-07-03) — it is
a sequential release, not a late backport. But **1.23.1 (2025-12-04) shipped
*after* 1.24.0 (2025-12-02)** — 1.23.1 is a backport on the 1.23 line, and it
carries the **strict** Origin semantics. A range of `>=1.24.0` correctly excludes it.

### 4.3 The finding that changes the recommendation

**T2 is a behavioural break, and it points at roomyx's own client.**

- **1.13.3 – 1.23.x (strict):** a request carrying **no `Origin` header is
  REJECTED** with 403 when `allowedOrigins` is configured.
- **1.24.0 – 1.30.0 (lenient):** a request carrying **no `Origin` header is
  ALLOWED**; only a *present and non-matching* Origin is rejected.

roomyx's own TUI client (`StreamableHTTPClientTransport`, running under
Bun/node, `src/client/mcp-client.ts`) and `registry.ts:215–231`'s `isRoomLive()`
probe **send no `Origin` header**. Browsers always send one; local programs do not.
That is precisely the asymmetry the guard exploits.

**Therefore:** if S2 sets `allowedOrigins` and a consumer resolves an SDK in
**1.13.3–1.23.x**, the guard **locks roomyx's own client and its liveness probe
out of its own server with a 403**. The fix would not merely no-op (A6's worry) —
it would **break the product**, and only on installs the maintainer never tested.

A floor of `>=1.13.3` — the naive "earliest version where the guard works" answer —
is therefore **wrong**. It satisfies A6 and introduces a worse bug.

### 4.4 Recommended floor: **`>=1.25.0`**

Recorded as a recommendation with rationale; the exact range syntax is the
owner's call (see §5 and the summary).

**Rationale, in order of weight:**

1. **It is the answer to the question actually asked** (T3): the earliest version
   where `StreamableHTTPServerTransport` forwards its options object into
   `WebStandardStreamableHTTPServerTransport`.
2. **It makes the tested code path the shipped code path.** At `>=1.25.0` every
   permitted install enforces the guard in `webStandardStreamableHttp.js` — the
   same file verified against the installed 1.30.0, and the same one S2's
   effect-assertion test will exercise. At `>=1.24.0` the semantics are right but
   the *implementation* is a different file, so the test proves less than it
   appears to. **Given that the whole point of G6e is asserting effect over
   configuration, testing the path consumers actually run is the consistent choice.**
3. **It is strictly above T2**, so the strict-Origin lockout of §4.3 is
   impossible by construction.
4. **Cost is near zero.** 1.25.0 shipped 2025-12-15; the repo already resolves
   1.30.0; nothing else in the tree pins the SDK.

**`>=1.24.0` is the defensible weaker floor** if the owner prefers the widest
range that is *behaviourally* safe. It is safe on semantics (T2) and on
enforcement (T1). It is rejected here only because it splits the supported range
across two implementations of the guard, one of which no test will ever run.

**`>=1.13.3` is rejected outright** — §4.3.

**Not a consumer-breaking change.** The SDK is a plain `dependencies` entry of a
leaf CLI package, not a peer dependency. Raising the floor narrows what npm may
resolve; it does not change roomyx's own published API. It is **not** part of the
compatibility event in §5.

### 4.5 Other SDK behaviour this floor confirms

Verified against installed 1.30.0 and consistent across the `>=1.25.0` range:

- **`onsessionclosed` fires only from `handleDeleteRequest`.** A client `close()`
  never sends DELETE → the `sessions` entry is retained forever. **This is R5's
  leak** (~102 KB/request; +18 MB per 200 legitimate cycles).
- **`StreamableHTTPClientTransport.terminateSession(): Promise<void>` exists** —
  R5's replacement for `close()` at `mcp-client.ts:56` and `registry.ts:229`.
- **Documented stateful contract:** invalid session id → **404**; non-init request
  with no session id → **400**. roomyx's handler bypasses this by minting a
  transport instead of delegating the unknown id (R5, and C4).
- **Host vs. Origin asymmetry:** the Host check rejects a **missing** Host header
  outright; the Origin check (at `>=1.24.0`) fires **only when Origin is present**.
  S2 must configure `allowedHosts` deliberately with that in mind — a missing Host
  header is a hard reject in every version in range.

---

## 5. Compatibility Surface

**Three scheduled items change published behaviour.** Naming the surface is this
phase's job; **deciding the release shape is not** — that is the owner's, deferred
to Phase 6 (`A3` is explicitly low-confidence and "must not be assumed by Phase 4").

| Item | Published surface changed | Documented at | Who breaks |
|---|---|---|---|
| **S1** | `roomyx.skills.sync` loses its caller-supplied **`targetPath`** input | `README:168` | **MCP client authors embedding `serveManagement`** — for them this is a breaking API change, not a security fix. The CLI keeps its literal-path escape hatch (`skill-targets.ts` `resolveTargets()`); the **network tool does not**. |
| **R8** | `serve` default port **4319 → 0** (ephemeral); `mcp` stays `4320` | `README:82`, `README:36/42` | anyone who relied on the documented fixed port |
| **R8** (2nd order) | previously-**silent** inputs now fail loudly: `--dryrun` ignored → rejected; bare trailing flags; `--port abc` → `NaN` → rejected | — | anyone who **scripted around** the old lenient parser |
| **R4** | **both `bin` entries change shape** — `.ts` + bun shebang → node-shebang launcher | `README:18` | anyone invoking the bin paths directly, or on Windows via the npm `.cmd` shim |

### What this implies for versioning

Stated as implications, **not as a decision**:

1. **It is a compatibility event, and it is not free.** Three simultaneous
   changes to published surface, one of which (S1) removes a documented input
   parameter. Under semver on a `0.x` package a minor bump signals a break, which
   is the mechanism available — but *which* bump, and whether the three land in
   one release or several, is Phase 6's call.
2. **The magnitude is the single lowest-confidence fact in the whole input (A2).**
   No download data was available offline. Whether this warrants a deprecation
   cycle or a minor bump plus README notes **depends on a number nobody has**.
   `NG6` currently rules out deprecation machinery *resting on that assumption* —
   so if the assumption is tested and fails, `NG6` is what gives way.
3. **The bundling question is open.** S1 must keep **its own commit** so it cannot
   be reverted as collateral, and ships in the **same PR as S2** (same attack
   path). Whether S1's break travels in the same *release* as R8's and R4's is
   undecided.
4. **The announcement has nowhere to live.** S1 is required to carry "its own
   changelog line" and **no `CHANGELOG.md` exists**; release notes are generated
   from commit titles by `--generate-notes`. Either a `CHANGELOG.md` is created or
   the requirement is discharged another way. **Undecided, deferred.**
5. **Three README statements are invalidated by the release that ships these**
   (`:18` Bun-on-PATH, `:82` port 4319, `:168` `targetPath`). G9's target is 0
   contradicted statements at tag time, measured by a **README-vs-behaviour audit
   as a release gate**.
6. **The release smoke test cannot currently catch any of this.** It runs
   `roomyx --help > /dev/null 2>&1 || true` — output discarded, exit code
   discarded — and `roomyx --help` exits 1 **today**, and this step has passed
   every release. **A green light wired to nothing.** R8 gives `--help` real
   semantics and R4 changes what `bin/roomyx` even *is*, so that step becomes the
   natural place to prove both. Whether it may be strengthened alongside R8 is
   **explicitly undecided** and listed as such in the problem statement.

**Not in scope for the compatibility event:** the SDK floor (§4.4) — internal
dependency range, not published surface.

---

## 6. Risk Register (stack-scoped)

| # | Risk | P | I | Mitigation |
|---|---|---|---|---|
| K1 | Floor set to `>=1.13.3` on the naive reading of A6 → strict-Origin era locks roomyx's own client out with 403 | **was high** — this is the default answer | **H** | **Resolved by measurement (§4.3).** Floor `>=1.25.0`. Assert the guard's *effect* against a real cross-origin request. |
| K2 | S2 ships, floor is not raised → guard silently no-ops on old-1.x installs (A6) | M | H | Floor raise is **inside S2's DoD**, not a follow-up (`D_sdk_floor`) |
| K3 | Floor raised but release job still runs bare `bun install` (S4 unshipped) → provenance signs an untested tree | M | M | **S4 must not ship after S2.** Sequence it with or before. (A7) |
| K4 | Transport fix lands in one of the two duplicated servers | **M** | H | C4; diff review as the stated measurement (2/2 or extracted once) |
| K5 | R1's test asserts a body *is* drawn rather than *failing* when seq 1 is absent | M | H | Write it red against current code first (G1) — the suite already has this exact blind spot |
| K6 | R2 widens `ConnectionStatus`, breaking `status-bar.ts:40`'s exhaustive lookup | M | M | Named in C8; `strict` catches it loudly if the record is typed exhaustively |
| K7 | D-01 ambiguity — amendment written against the wrong registry | M | M | C7: every reference names the file |
| K8 | Amendments skipped under time pressure; owner == implementer (A1) | **M** | **H** | Binary blocking DoD artifacts with named commits — **not** checklist lines |
| K9 | R3/R8 collide over `seed.ts` (A5, confidence low/undetermined) | M | M | R3 first by build order; settle R8's parser scope **after** R3 lands |
| K10 | New parser/scroll code rejected by `noUncheckedIndexedAccess` | H | L | C8; follow existing cast/`??` idioms |

---

## 7. Decisions Recorded by This Phase

```yaml
D_level: published solo-maintainer 0.x dev tool — pet-scale on team/budget/SLA,
         production-scale on distribution/reversibility (signed immutable npm)
D_process_bar: lightweight per fix; high bar only for security surface,
               published surface, and the two decision amendments
D_stack_frozen: 0 new technologies; no alternatives evaluated (task_in_project + NG3)
D_runtime: Bun 1.3.11 installed; engines.bun ">=1.1.0" declared and enforces nothing
D_shipped_artifact: src/*.ts executed by Bun — no build step, no dist/
D_no_build_step_unrecorded: README prose only; grep of BOTH decision registries for
                            build/transpile/shebang/bun/dist returns zero — R4 needs a
                            doc edit, not a decision carve-out
D_launcher_shape: node shebang; probes PATH; never fetches/installs/bootstraps Bun
                  (installer D-01); must live under src/ (files whitelist)
D_sdk_guard_thresholds: T1 guard enforced >=1.13.3; T2 lenient-Origin >=1.24.0;
                        T3 web-standard forwarding >=1.25.0 (measured over 30 tarballs)
D_sdk_floor_recommended: ">=1.25.0" — forwarding threshold AND the only range where the
                         tested code path equals the shipped code path; >=1.24.0 is the
                         defensible weaker floor; >=1.13.3 REJECTED (breaks roomyx's own
                         Origin-less client with 403)
D_sdk_floor_not_compat_event: dependency range, not published surface
D_transport_two_files: serve.ts (102L) + mcp-management/server.ts (175L), ~90% dup;
                       guard and 404 belong in the shared handler; 4 test suites affected
D_opentui_sufficient: wrapMode/truncate + scrollBy/scrollTop/scrollTo/stickyScroll all
                      verified present at 0.5.11 — R1 is a state machine, not primitives
D_test_style: zero mocking libraries verified; real servers/SDK clients/Bun.spawn;
              R1 test must FAIL red first; S2 test asserts 403/-32000 effect not config
D_decision_format: Russian, D-NN, Решение/Причина/Отвергнутая альтернатива, TWO registries
                   both with a D-01 — every reference must name the file
D_compat_surface: S1 (targetPath), R8 (4319→0 + loud parser), R4 (bin shape);
                  release shape DEFERRED to Phase 6 (A3 low confidence)
D_changelog_gap: S1 requires a changelog line; no CHANGELOG.md exists — undecided
D_smoke_test_broken: release `roomyx --help >/dev/null 2>&1 || true` has never been able
                     to fail; R8+R4 make it meaningful — strengthening it is undecided
```

---

## 8. Next Phase Needs

1. **Phase 3 (patterns)** — the shared-transport extraction shape (C4) is the one
   genuine architecture question in this backlog: extract-once vs. apply-twice,
   given four test suites construct these servers. Everything else is
   pattern-inherited.
2. **Phase 3** — R1's scroll state machine against the
   `owner-prompt.ts` + separate-unit-test precedent (C5, C8), including whether
   `stickyScroll`'s `_hasManualScroll` / `isAtStickyReengagePoint` already
   satisfies `testing-story.md:171`. **Test before reimplementing.**
3. **Phase 4 (spec)** — must consume §3's constraints as given and **must not**
   assume the release shape (A3). The SDK floor is settled here as a
   recommendation; the exact range string is an owner ratification.
4. **Phase 6 (planning)** — owns the compatibility event: version decision,
   bundling of S1/R8/R4 across releases, where S1's changelog line lives, whether
   the smoke test is strengthened, and how R3/R8 divide `seed.ts` (A5).
5. **Owner gate (this phase's exit)** — four rulings requested; see summary.

---

| Key | Value |
|-----|-------|
| Created | 2026-09-09 |
| Agent | gproject-stack-advisor |
| Phase | 2 |
| Job | gproject-roomyx-backlog |
| Mode | task_in_project |
| Status | final — pending owner approval gate |
