# Technical Best Practices & Constraints: roomyx 0.4.0 remediation

Job: `gproject-roomyx-backlog` · Phase 3 · mode `task_in_project`
Companion to `artifacts/architecture.md`. Inherits `artifacts/stack-decision.md` §3 (C1–C9) **in full**.

> `metaproject: unavailable`.

---

## How to use this document

Every requirement in the Phase 4 PRD **MUST** be compatible with the constraints
below. The Phase 5 consistency-checker validates the PRD against them by ID.

- **MUST / MUST NOT** — a PRD that violates one is wrong and gets sent back.
- **SHOULD** — a PRD that violates one must say why, in writing.
- Each constraint names the items it binds and the evidence behind it.
- `[measured]` means it was executed in this phase against the installed tree,
  not read.

**Inherited, not repeated here:** stack-decision C1–C9. They remain binding. This
document adds what Phase 3 measured or ruled, and restates only the four
constraints the task explicitly carried forward (PKG-1..4, SEC-3, TEST-1, DEC-1).

---

## 1. Packaging & the shipped artifact

### MUST
- **PKG-1** — No build step. `src/*.ts` is the shipped artifact. No `dist/`, no
  transpiler, no bundler. *(NG5, C1)* — binds R4, R3, every item that adds a file.
- **PKG-2** — Every file referenced by `package.json`'s `bin` MUST live under a
  path already in `files` (`["src", "LICENSE", "README.md", "package.json"]`).
  R4's launchers go at `src/bin/roomyx.js` and `src/bin/roomyx-client.js`.
  *(architecture A10)*
- **PKG-3** — R4's launchers MUST use `#!/usr/bin/env node` and MUST `exec` bun
  with the real entry module. They MUST NOT attempt to execute `cli.ts` /
  `client/index.ts` under node. **Two distinct `import.meta` properties are at
  risk and the PRD must name both:**

  | Property | Site | What a launcher threatens |
  |---|---|---|
  | `import.meta.dir` | `cli.ts:47` (`bundled-skills`), `cli.ts:174` (`../package.json`) | must keep resolving to `src/` — so hand off to bun, do not relocate the entry |
  | **`import.meta.main`** | `client/index.ts:132` | **the one a launcher actually breaks.** It is how that file decides whether it was run directly or imported; `cli.ts`'s `roomyx client` subcommand relies on it being **false** under `await import()`. A launcher that spawns or re-execs that entry point changes what "main" means and runs `runClient()` twice. |

  *(C2 — restored in full; earlier drafts truncated this to `import.meta.dir` and
  were therefore silent on the property most at risk.)*
- **PKG-4** — After R4, a test MUST assert **through the launcher, not through
  `cli.ts` directly**: (a) `roomyx --version` still resolves `../package.json`
  relative to `import.meta.dir`; (b) `roomyx client` still reaches `runClient()`
  exactly once, proving `import.meta.main` is still `false` on the imported path.

### MUST NOT
- **PKG-5** — The launcher MUST NOT fetch, install, download or bootstrap Bun, or
  make any network call, at install time or first run. *(installer **D-01** in
  `docs/roomyx-installer/decisions.md`; G5's hard negative criterion.)*
- **PKG-6** — No `postinstall` hook may be added. *(same decision)*
- **PKG-7** — `engines.bun` MUST NOT be presented in any PRD text as an enforced
  constraint. It enforces nothing.

### SHOULD
- **PKG-8** — The R4 acceptance test SHOULD run the launcher under a `PATH`
  stripped of `bun` in a real `Bun.spawn` subprocess and assert **non-empty
  stderr mentioning Bun, exit code 1, and zero network calls**.

---

## 2. HTTP transport & module boundaries

### MUST
- **TR-1** — The shared HTTP transport MUST be extracted to
  `src/server/http-transport.ts` **before** S2 or R5 changes transport
  behaviour. `serve()` and `serveManagement()` MUST keep their current exported
  signatures and become adapters. *(architecture §4, ruling A1)*
- **TR-2** — The extraction MUST be its own commit, inside S2's PR, so a revert of
  S2 does not revert it. `[measured]` it edits **zero** test files.
- **TR-3** — After TR-1, any transport-level change MUST land in exactly one
  place. A PRD requirement that says "apply in both files" is a violation.
- **TR-4** — `ServeOptions`, `ServeHandle`, `ManagementOptions`,
  `ManagementServeOptions`, `ManagementHandle` MUST remain exported from their
  current modules. `serveMcpOverHttp` MUST NOT be added to `bin`, to a tool
  schema, or to the README.
- **TR-5** — The transport MUST preserve one-transport-per-session. A single
  `StreamableHTTPServerTransport` completes exactly one `initialize` for its
  lifetime; the per-session transport + `McpServer` pair MUST NOT be collapsed.
- **TR-6** — R5's unknown-`mcp-session-id` handling MUST delegate to the SDK
  (which answers **404**) rather than minting a transport. The current
  unconditional `createSession()` is the orphan-transport leak.

### MUST NOT
- **TR-7** — Tests MUST NOT import transport internals (`LOOPBACK_HOSTS`,
  `createSession`, the `httpServer`). `[measured]` none do today; this is what
  makes TR-1 free.
- **TR-8** — The non-loopback refusal and `--acknowledge-non-loopback` escape
  hatch MUST NOT be removed or weakened by the extraction.

---

## 3. Security (S1, S2, R5)

### MUST
- **SEC-1** — `@modelcontextprotocol/sdk` floor raised to **`>=1.25.0`** inside
  **S2's own definition of done**, not as a follow-up. *(owner ruling
  `D_sdk_floor_ruling`; `>=1.13.3` rejected — it 403s roomyx's own Origin-less
  client.)*
- **SEC-2** — S4 (`bun install` → `bun install --frozen-lockfile` in
  `release.yml`) MUST ship **with or before** S2. *(`D_s4_before_s2`; a raised
  floor is meaningless if the release job resolves a tree CI never tested, and
  provenance would sign it.)*
- **SEC-3** — Every security acceptance criterion MUST assert **effect, not
  configuration**. A test asserts an HTTP **403** with JSON-RPC code **`-32000`**,
  or a written/not-written file. A test that asserts
  `enableDnsRebindingProtection === true` in an options object is a violation and
  MUST be rejected. *(G6e)*
- **SEC-4** — `allowedHosts` MUST be built from the **bound port**, inside
  `createSession()`, after `listen()`. `[measured]` against SDK 1.30.0:

  ```
  allowedHosts: ["127.0.0.1","localhost"]           → 403 "Invalid Host header: 127.0.0.1:39011"
                                                        on roomyx's OWN client
  allowedHosts: ["127.0.0.1:<p>","localhost:<p>"]   → 200
  ```

  A PRD that specifies a static, port-less allowlist is specifying an outage.
- **SEC-5** — **Both** `allowedHosts` and `allowedOrigins` MUST be configured.
  `[measured]` they defend different attacks: a browser hitting
  `http://127.0.0.1:<port>/mcp` sends a *valid* Host and is stopped only by
  Origin; a DNS-rebound page sends `Host: attacker.example` and is stopped only by
  Host.
- **SEC-6** — S1 MUST remove `targetPath` from `roomyx.skills.sync`'s
  `inputSchema` **and** its handling at `mcp-management/server.ts:62–74`. The CLI
  literal-path escape hatch in `skill-targets.ts` `resolveTargets()` MUST be kept.
- **SEC-7** — S1 keeps its own commit; S1 and S2 ship in the same PR.
- **SEC-8** — R5 MUST replace `client.close()` with
  `StreamableHTTPClientTransport.terminateSession()` at `mcp-client.ts:56` and
  `registry.ts:229`. `close()` never sends DELETE, so `onsessionclosed` never
  fires and the `sessions` entry is retained forever.

### MUST NOT
- **SEC-9** — The guard MUST NOT be described, in code comments, the README, the
  D-06 amendment or the PRD, as **authentication**. It stops browsers, not local
  processes. *(`D_guard_scope`)*
- **SEC-10** — No auth token, no credential, no session secret is to be
  introduced. D-06 deferred authentication and this remediation does not
  un-defer it. *(NG4)*
- **SEC-11** — The header check MUST NOT be hand-rolled in roomyx's own handler.
  Use the SDK constructor options; SEC-1's floor is what makes that safe.

---

## 4. Render surface (R1, and R12 if ever scheduled)

### MUST
- **UI-1** — R1 MUST NOT introduce a scroll state machine. `[measured]`
  `stickyScroll` already suspends on manual scroll and re-engages at the bottom,
  including for key-driven scrolling. Writing one is a second, worse copy of
  correct library code. *(architecture §5.3, ruling A4)*
- **UI-2** — The seq-1 over-scroll MUST be fixed by adding
  `horizontalScrollbarOptions: { visible: false }` to `chat-view.ts:36`.
  `[measured]` root cause: the horizontal scrollbar renderable consumes one
  viewport row, so `maxScrollTop` computes as 1 on an under-filled pane and
  sticky-bottom scrolls seq 1 off the top. `scrollX: false` alone does **not**
  fix it; `contentOptions` variants do not fix it. *(ruling A5)*
- **UI-3** — Scroll keys MUST be delegated to
  `ScrollBoxRenderable.handleKeyPress`, which `[measured]` already handles
  `up`/`k`, `down`/`j`, `pageup`, `pagedown`, `home`, `end` and maintains sticky
  suspension itself.
- **UI-4** — The transcript binds **`pageup` / `pagedown` / `home` / `end`**.
  `up`/`down` MUST stay bound to `chatView.roster.moveSelection`. *(ruling A6 —
  rebinding them removes the roster's only interaction path, `NG4`, and adds a
  fourth unforced published-behaviour change to `P9`'s three.)*
  **Recorded so this does not read as silent scope loss:** the acceptance
  criterion naming `PgUp/PgDn/Ctrl-U/Ctrl-D` originated in R11, which the room
  retired into R1; it stands today under **R1** at
  `docs/roomyx/improvement-backlog.md:162`. The owner ruled
  `PgUp/PgDn/Home/End`. `Home`/`End` replace `Ctrl-U`/`Ctrl-D` because
  `ScrollBoxRenderable.handleKeyPress` implements all four natively, whereas
  half-page scrolling would need its own delta arithmetic — the hand-rolled
  scroll math UI-1 exists to forbid. The key set is equal in size and entirely
  library-driven.
- **UI-5** — The scroll API MUST be a new public method on `ChatView`
  (`handleTranscriptKey(event): boolean`). `ChatView.scroll` MUST stay `private`.
  *(ruling A7; §1.2's "the TUI never reaches into a component's internals".)*
- **UI-6** — Body wrapping MUST use `wrapMode: "word"` on the `TextRenderable`
  with the hardcoded `height: 1` **removed**. No hand-rolled wrapper.
- **UI-7** — Order inside R1 is fixed: **failing seq-1 test → `chat-view.ts:36` →
  `message-row.ts`.** `[measured]` mechanism: wrapping raises `content.height`,
  which raises `maxScrollTop`, which multiplies the one-row over-scroll.
- **UI-8** — R12, if ever scheduled, inherits UI-6's primitive in
  `status-bar.ts`. It MUST NOT write a second wrapper. *(NG1 — a constraint on a
  future item, not a schedule for it.)*
- **UI-9** — Any widening of `ConnectionStatus` (R2's pane state) MUST widen the
  exhaustive record at `status-bar.ts:40` in the same commit, and check
  `chat-view.ts:40`. *(K6)*

### MUST NOT
- **UI-10** — MUST NOT expose `ScrollBoxRenderable` to `client/index.ts`.
- **UI-11** — MUST NOT add a second connection/pane state variable alongside
  `ConnectionStatus`. Two variables for one state is P2 restated. *(ruling A9)*

### SHOULD
- **UI-12** — The empty-pane and error-pane states SHOULD be `setEmpty()` /
  `setError(message)` on `ChatView`, matching the existing `setNotice` /
  `setRoster` / `show` / `hide` imperative-API convention.

---

## 5. CLI grammar (R8, R3, R4)

### MUST
- **CLI-1** — One `parseFlags`. The three copies (`cli.ts:20–36`,
  `client/index.ts:12–22`, `cli/seed.ts:17–27`) MUST converge on a single module
  (`src/cli/flags.ts`). *(ruling A8)*
- **CLI-2** — The unified parser MUST preserve the boolean-flag contract read at
  `cli.ts:72` and `cli.ts:158` (`flags["acknowledge-non-loopback"] === true`).
- **CLI-3** — `--help` on **any** command MUST print to **stdout**, exit **0**,
  and perform **no side effect**. `serve --help` MUST start no server and mint no
  room id.
- **CLI-4** — Unknown flags, bare trailing flags, and unparseable values
  (`--port abc` → `NaN`, `--port` bare → `1`) MUST be rejected loudly with a
  message naming the flag.
- **CLI-5** — Parser code MUST satisfy `noUncheckedIndexedAccess`. `args[i]` is
  `string | undefined`. Follow the existing idioms: `as [string, ...string[]]`
  (`log/store.ts:57`), `?? fallback`, explicit narrowing. *(K10)*
- **CLI-6** — `serve`'s default port changes to `0`; `mcp` stays `4320`. The
  `README.md:36/42/82` edits MUST ship in the same commit.

### MUST NOT
- **CLI-7** — MUST NOT scan for flags positionally-anywhere such that
  `roomyx serve --port 0 room.jsonl` serves a file named `--port`.

---

## 6. Filesystem & installer (S3, R3)

### MUST
- **FS-1** — S3 MUST route the **unconditional `copyFileSync`** at `init.ts:44`
  through `syncSkill()` (backup, hash record, warnings).
  **`init.ts` does not currently import `skill-sync` at all** — verified: its only
  imports are `copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync`
  from `node:fs` and `join` from `node:path`. S3 **introduces** that dependency
  edge; it does not follow an existing call site.
  The `existsSync` guards at `:36–43` guard `config.json` and `registry.json`
  with plain `writeFileSync` — they are the *contrast* that makes `:44` an
  anomaly, **not** a reference use of `syncSkill`. The contract S3 restores is the
  one documented at `README:183–196` and implemented in
  `skill-sync.ts:46–100`. Any PRD wording of the form *"follow the existing
  pattern in `init.ts`"* is a forward reference to work S3 has not done yet and is
  a violation of this constraint.
- **FS-2** — Surfacing `syncSkill`'s warnings changes `InitResult`
  (`{ created, roomyxDir }`); `cli.ts:53–56`'s `runInit()` print MUST be updated
  in the same commit.
- **FS-3** — New file writes MUST follow the project's own patterns:
  write-temp-then-rename (`registry.ts:126–130`) or backup-before-overwrite
  (`skill-sync.ts:83–86`).
- **FS-4** — R3's `room append` MUST refuse against a path `listLiveRooms()`
  reports live, with `--force` as the override. This is the *implemented* half of
  the D-01 amendment, not just its documented half. *(G4)*

### MUST NOT
- **FS-5** — R3 MUST NOT introduce a second home-grown command/file channel.
  *(roomyx **D-02** in `docs/roomyx/decisions.md`.)*

---

## 7. Validation & error handling

### MUST
- **ERR-1** — zod schemas at module top; `safeParse` + explicit throw with a
  human-readable message. **Never a bare `.parse()`.**
- **ERR-2** — MCP `inputSchema` is a **plain object of zod validators**, not
  `z.object({...})`. Binds S1's schema edit and R10's `limit` if ever scheduled.
- **ERR-3** — Every error message MUST name the file path it concerns.
  `store.ts:58`'s bare `JSON.parse` is the single exception in the codebase and
  is R2's to remove (both `:58` and the per-message `:71`).
- **ERR-4** — Messages, not objects, at the CLI boundary; `console.error` then
  `process.exit(1)`.
- **ERR-5** — R2: `callTool<T>()` at `mcp-client.ts:113–118` MUST check
  `result.isError` before parsing. A tool error MUST NOT be reported as a
  disconnect.
- **ERR-6** — R2: `runServe()` MUST call `loadRoomLog()` **before** binding, so a
  nonexistent path fails with the file named and never registers.

---

## 8. Testing

### MUST
- **TEST-1** — **Zero mocking libraries.** No `vi.*`, `jest.*`, `sinon`,
  `proxyquire`, `testdouble`, `spyOn`. Real `serve()` on `port: 0`, real
  `StreamableHTTPClientTransport`, real `Bun.spawn`. *(`D_no_mocking`; verified
  zero matches across `test/`.)* `mockInput` from `@opentui/core/testing` is a
  keyboard driver, not a mocking library, and is permitted.
- **TEST-2** — `import { afterEach, describe, expect, test } from "bun:test"` —
  explicit imports, no globals. `describe` → `test`, one level.
- **TEST-3** — R1's seq-1 test MUST be written against current code and observed
  **red** before the fix. A test that asserts a body is drawn but passes today is
  a violation. *(G1, K5.)* `[measured]` such a test is red today:
  `frame1 has body-001: false` against the real `ChatView` with 3 messages in an
  80×12 terminal.
- **TEST-4** — S2's test MUST assert **403 / `-32000`** from a real cross-origin
  request against a real server. *(= SEC-3.)*
- **TEST-5** — Temp dirs via `mkdtempSync(join(tmpdir(), "roomyx-…-"))`, cleaned
  in `afterEach` with `rmSync(dir, { recursive: true, force: true })`. Handles in
  module-level `let activeHandle` / `procs[]`, closed in `afterEach`.
- **TEST-6** — Subprocess timing uses poll-until-deadline helpers
  (`waitForRegistration`, `waitForStdout`). **No fixed sleeps.** Per-test timeout
  as `test()`'s third argument.
- **TEST-7** — Test names state the finding/AC in parentheses — `(AC3)`,
  `(regression, real subprocess concurrency)`.
- **TEST-8** — Render tests: `createTestRenderer({ width, height })` →
  `renderOnce()` + `captureCharFrame()`, or
  `waitForFrame(frame => frame.includes(body))`.
- **TEST-9** — S1 MUST update `test/mcp-management/server.test.ts:81` (the
  "neither target nor targetPath" assertion) in S1's own commit.
- **TEST-10** — The TR-1 extraction MUST be validated by the **existing** 7
  suites without editing any of them. If a test needs editing, the extraction has
  changed behaviour and is wrong.

### MUST NOT
- **TEST-11** — MUST NOT add a mocking dependency to `package.json` for any
  reason.
- **TEST-12** — MUST NOT assert a config value where an effect is observable.

### Test-pyramid target
Descriptive, not a quota: **≈60% integration / 25% subprocess-e2e / 15% pure
unit**, matching the existing suite. Add the test whose failure mode matches the
finding; do not add a unit layer to hit a ratio.

---

## 9. Decision register

### MUST
- **DEC-1** — Amendments use the register's shape and language:
  `## D-NN: <заголовок>` with **Решение / Причина / Отвергнутая альтернатива**,
  Russian prose.
- **DEC-2** — **Two registers both contain a `D-01`.** Every reference — in a
  commit message, a test name, a code comment, or the PRD — MUST name the file.

  | Register | `D-01` is | Binds |
  |---|---|---|
  | `docs/roomyx/decisions.md:7` | server reads only; the dispatcher is the log's single writer | **R3 gate** |
  | `docs/roomyx-installer/decisions.md:7` | `init` is explicit, never a postinstall hook, no install-time network | **R4 hard criterion (PKG-5)** |

- **DEC-3** — Placement is binary definition-of-done, not a checklist line:

  | Amendment | Register file | Lands in |
  |---|---|---|
  | D-01 amendment | **`docs/roomyx/decisions.md`** | its own commit, **before R3 work begins** |
  | D-06 amendment | **`docs/roomyx/decisions.md`** | **inside S2's commit** |
  | **D-07 (new, proposed)** — единый HTTP-транспорт для обоих MCP-серверов | **`docs/roomyx/decisions.md`** | the extraction commit (commit 1 of S2's PR) — **needs owner ratification** |

- **DEC-4** — `docs/roomyx-installer/decisions.md` receives **no amendment** in
  this remediation. Its D-01 is cited by PKG-5 and is correct as written.
- **DEC-5** — Comments carry decisions in this codebase. Fixes MUST extend the
  *why* paragraphs, naming the decision or the review that found the bug. A fix
  that deletes such a comment is a violation.

---

## 10. Release & CI

### MUST
- **REL-1** — `release.yml` MUST NOT be renamed. OIDC trusted publishing is
  registered for `MrCipherSmith/roomyx` + that exact filename.
- **REL-2** — `v*` tag remains the only release trigger. No `workflow_dispatch`.
  *(NG7)*
- **REL-3** — S4 is exactly `bun install` → `bun install --frozen-lockfile` in
  the release job, and ships with or before S2. *(= SEC-2.)*
- **REL-4** — At tag time, `README.md:18`, `:82` and `:168` MUST be consistent
  with shipped behaviour. *(G9; target 0 contradicted statements.)*

### SHOULD
- **REL-5** — The release smoke step
  (`roomyx --help > /dev/null 2>&1 || true`) SHOULD lose its `|| true` once R8
  gives `--help` real semantics and R4 changes what `bin/roomyx` is. **Explicitly
  undecided — deferred to Phase 6.** The PRD MUST NOT assume it either way.

### MUST NOT
- **REL-6** — The PRD MUST NOT assume a release shape: which version, whether
  S1/R8/R4 bundle into one release, or where S1's changelog line lives (no
  `CHANGELOG.md` exists). All deferred to Phase 6. *(A3 is low-confidence and
  "must not be assumed by Phase 4".)*
- **REL-7** — No deprecation cycle, shims, aliases or migration tooling. *(NG6)*

---

## 11. Scope constraints the PRD must not breach

### MUST NOT
- **SCOPE-1** — No new findings; scope is closed at fifteen, ten scheduled.
- **SCOPE-2** — No re-pricing of the room's sizes, **except** where a size is
  proven wrong with shown evidence. One such proof exists and is stated in
  `architecture.md` §5.7: **R1's scroll half was priced on the assumption that a
  state machine had to be built; that assumption is measured false.** The PRD MUST
  carry that claim with its evidence, and MUST NOT extend the exception to any
  other item. *(`D_no_reestimate`)*
- **SCOPE-3** — No promotion of R7, R10, R12, or R9's drain half. The single
  permitted ride-along is R9's deregister-ordering fix inside R2's diff. *(NG1)*
- **SCOPE-4** — No features. Where a fix implies new surface (R3's
  `room new|append`), it exists to make a *documented* claim true. *(NG4)*
- **SCOPE-5** — No RFC, ADR-per-fix, staged rollout, feature flags, observability
  work, or migration tooling. The three named exceptions where the bar rises are
  the security surface, the published surface, and the two decision amendments.
  *(NG6, `D_level`)*

---

## 12. Quick constraint index

| ID range | Area | Count |
|---|---|---|
| PKG-1..8 | packaging / launcher | 8 |
| TR-1..8 | transport & extraction | 8 |
| SEC-1..11 | security | 11 |
| UI-1..12 | render surface | 12 |
| CLI-1..7 | CLI grammar | 7 |
| FS-1..5 | filesystem / installer | 5 |
| ERR-1..6 | validation & errors | 6 |
| TEST-1..12 | testing | 12 |
| DEC-1..5 | decision register | 5 |
| REL-1..7 | release & CI | 7 |
| SCOPE-1..5 | scope | 5 |
| **Total** | | **86** |

Plus stack-decision **C1–C9**, inherited unchanged.

---

| Key | Value |
|-----|-------|
| Created | 2026-09-09 |
| Agent | gproject-patterns-researcher |
| Phase | 3 |
| Job | gproject-roomyx-backlog |
| Mode | task_in_project |
| Status | final — pending owner approval gate |
