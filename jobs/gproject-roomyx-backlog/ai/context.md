# Context — roomyx 0.4.0 defect backlog (15 items)

## Task Overview

Execute a 15-item defect backlog against `@mrciphersmith/roomyx@0.4.0` (source:
`/home/altsay/roomyx`). Findings are **already reproduced and verified** — see
`docs/roomyx/improvement-backlog.md`. This document is the *map*: which files each
cluster touches, what the test suite does and does not assert, the conventions the
code follows, and the library/version constraints the fixes must live inside.

Backlog IDs used throughout: S1–S4 (ship now), R3 (position zero, owner-gated),
R1/R2/R8/R4/R5 (the ranked five), R7/R9/R10/R12 (below the line).

---

## Repository Facts

| Fact | Value |
|---|---|
| Runtime | Bun (`#!/usr/bin/env bun` shebangs); ships **TypeScript source, no build step** |
| Module system | ESM (`"type": "module"`), `moduleResolution: "bundler"` |
| TS strictness | `strict: true` **and** `noUncheckedIndexedAccess: true` (`tsconfig.json`) |
| Lint | `eslint.config.js` — `typescript-eslint` recommended + `no-require-imports`, `no-unused-vars` with `^_` ignore pattern |
| Test runner | `bun test` (`bun:test`) |
| Gates | `bun run check` = `lint && typecheck && test`; CI additionally runs `bun audit` |
| Source files | 24 under `src/`; 17 test files (~1845 lines) under `test/` |

`noUncheckedIndexedAccess` matters: `arr[0]` is `T | undefined` everywhere. Existing
code handles this with `as [string, ...string[]]` casts (`log/store.ts:57`),
`?? fallback`, and `as RoomRegistryEntry` (`resolve-connection.ts`). New parser /
scroll code must do the same or it will fail `bun run typecheck`.

---

## File Map by Cluster

### A. Flag parsing — three divergent parsers (S1-adjacent, **R8**, R13/R14 absorbed)

| File | Lines | What is there |
|---|---|---|
| `src/cli.ts` | 20–36 | `parseFlags(args)` → `Record<string, string \| boolean>`. Scans for `--x` **anywhere**; bare trailing flag → `true`. Consumed by `runServe`, `runSkillsSync`, `runMcp`. |
| `src/client/index.ts` | 12–22 | `parseFlags(args)` → `Record<string, string>`. Bare trailing flag → **`""`** (line 17), and line 26's `flags["registry"] ?? default` does not catch empty string. |
| `src/cli/seed.ts` | 17–27 | Third copy, identical shape to the client's. Also the *only* room-log creation tool (see R3). |

Dispatch/consumption sites that the fix must reconcile:

- `src/cli.ts:180–203` `main()` — command dispatch. There is **no `--help` branch**;
  `serve --help` falls into `runServe(rest[0]=…)`. Unknown command → `USAGE` on
  **stderr** + `process.exit(1)` (`cli.ts:198–202`).
- `src/cli.ts:50–51` — the single `USAGE` string.
- `src/cli.ts:70` — `Number(flags.port)`: `true → 1`, `"abc" → NaN`.
- `src/cli.ts:93–102` `runRoomsList()` — takes **no arguments**, hardcodes
  `defaultRegistryPath()`. R13.
- `src/cli.ts:38–48` — `defaultRegistryPath()`, `defaultConfigPath()`,
  `bundledSkillPath()` (uses `import.meta.dir`, Bun-only).
- Port defaults live in two places: `src/server/serve.ts:76` (`?? 4319`) and
  `src/mcp-management/server.ts:149` (`?? 4320`). R8 wants `serve` → `0`,
  `mcp` stays `4320`. Changing `serve`'s default requires a `README.md:36/42` edit.
- `src/cli.ts:72` and `:158` read `flags["acknowledge-non-loopback"] === true` —
  a boolean-flag contract the new parser must preserve.

### B. Render surface (**R1**, R12; R11 merged into R1)

| File | Lines | What is there |
|---|---|---|
| `src/client/screens/chat-view.ts` | 36 | `new ScrollBoxRenderable(ctx, { flexGrow: 1, stickyScroll: true, stickyStart: "bottom" })` — the one-row over-scroll. **Start here** (per the finder's stated order). |
| | 53–58 | `appendMessages()` — resolves `fromName` from `rosterById`, one `createMessageRow` per message. No empty state, no error state, no `setError`/`setEmpty` surface at all. |
| `src/client/components/message-row.ts` | 6–11 | Whole file: `TextRenderable` with `content: \`${fromName}: ${message.body}\`` and hardcoded `height: 1`. `kind` and `in_reply_to` never read. |
| `src/client/components/status-bar.ts` | 35–44 | `render()` builds `` `[${statusLabel}] ${goalStatement}` ``, `height: 1`. `goal.criteria` and `goal.threshold` are dropped (R12). `setNotice()` takes over the line. |
| `src/client/index.ts` | 84–129 | Keypress wiring. `up`/`down` → `chatView.roster.moveSelection` (**nothing scrolls the transcript**). `q`/`Ctrl-C` quits. `o` opens the owner prompt, which owns the keyboard while open. |
| `src/client/screens/agent-modal.ts` | 33, 47 | Second `ScrollBoxRenderable` consumer and second `createMessageRow` consumer — any row-shape change lands here too. |
| `src/client/components/roster-sidebar.ts` | — | Convention reference: per-row `TextRenderable`s, rebuilt on `setRoster`. |

`ChatView` exposes `statusBar` and `roster` as public readonly; `scroll` is
**private** — a scroll-key API has to be added to `ChatView`, not reached into.

### C. Polling client (**R2**)

`src/client/mcp-client.ts`:

- `:113–118` `callTool<T>()` — `JSON.parse(content[0]?.text ?? "null")` with
  **no `result.isError` check**. This is the R2 defect.
- `:120–132` `pollState()` / `:134–149` `pollTranscript()` — both `.catch()` →
  `handleDisconnect()`, so a parse failure is indistinguishable from a dead socket.
- `:151–157` `handleDisconnect()` — clears timers, sets `disconnected`, reconnects
  after `transcriptIntervalMs`.
- `:52–58` `stop()` — calls `this.client?.close()`. **R5 wants `terminateSession()`**
  (see Libraries below).
- `:69–73` `setStatus()` dedupes; `ConnectionStatus = "connecting" | "connected" | "disconnected"`
  — R2's "pane state" work likely widens this union, which ripples to
  `status-bar.ts:40` (the status-label record must stay exhaustive) and
  `chat-view.ts:40`.

Server side of R2:
- `src/cli.ts:58–91` `runServe()` — binds (`serve(...)`) **then** registers; never
  opens the log. `loadRoomLog()` must be called before binding.
- `src/log/store.ts:58` — bare `JSON.parse(headerLine)`; a malformed first line
  throws a raw `SyntaxError` naming no file, while `:54`, `:60–62` and `:74` all
  carefully name `path`. Same for `:71` per-message `JSON.parse`.

### D. HTTP transports (**S2**, **R5**, R7)

`src/server/serve.ts` and `src/mcp-management/server.ts` are near-identical twins —
**any transport fix must be made twice** (or the shared shape extracted):

| Concern | `server/serve.ts` | `mcp-management/server.ts` |
|---|---|---|
| Loopback set | `:6` `LOOPBACK_HOSTS` | `:99` duplicate |
| Non-loopback refusal | `:36–41` | `:111–116` |
| `sessions` map | `:43` | `:118` |
| `createSession()` | `:45–58` | `:120–133` |
| `createServer` handler | `:60–74` | `:135–147` |
| Default port | `:76` `4319` | `:149` `4320` |
| `close()` | `:93–101` | `:166–174` |

Both handlers do: read `mcp-session-id` → if present and known, reuse; **otherwise
`createSession()` unconditionally**. That is R5's orphan-transport mint: an unknown
session id creates a fresh transport + `McpServer` that never lands in `sessions`
(because `onsessioninitialized` only fires on a real `initialize`) and therefore can
never be closed. The Origin/Host guard (S2) belongs in this same handler, before
`transport.handleRequest`.

### E. Installer (**S1**, **S3**, R7)

- `src/installer/init.ts:44` — `copyFileSync(options.bundledSkillPath, join(skillDir, "SKILL.md"))`,
  **unconditional**, four lines after the `existsSync` guards at `:38` and `:41`.
  S3 = route through `syncSkill` and surface `result.warnings`. `InitResult` is
  `{ created, roomyxDir }` — surfacing warnings changes that shape and
  `cli.ts:53–56`'s `runInit()` print.
- `src/installer/skill-sync.ts:46–100` — `syncSkill()`. Note `:78`
  `targetHasIndependentChanges && !options.yes` is the **single** gate for both
  refusal reasons (the "already fixed" doc item; making it two gates is a code change).
  `:75–77` `dryRun` returns before any write.
- `src/mcp-management/server.ts:54` — `targetPath: z.string().min(1).optional()`.
  **S1 deletes this parameter** plus its handling at `:62–74`. `NAMED_TARGETS` +
  `"all"` remain. `test/mcp-management/server.test.ts:81` currently asserts the
  "neither target nor targetPath" error message — that test changes with S1.
- `src/installer/registry.ts:215–231` `isRoomLive()` — 500 ms timeout, `connect()`
  only (the `initialize` handshake), never opens the log, never checks *which* room
  answered. `:187–213` `listLiveRooms()` **prunes on timeout**. R7's fix needs a new
  `room.health` tool in `src/server/index.ts` returning the registered room id.
  `pid` is written at `cli.ts:79`, stored in the schema (`registry.ts:11`), read by
  nobody.
  `isRoomLive` also calls `client.close()` — R5 wants `terminateSession()`.
- `src/installer/resolve-connection.ts` — thin wrapper over `listLiveRooms`; the
  client's only path into the registry.
- `src/installer/skill-targets.ts` — `NAMED_TARGETS = ["claude","codex","keryx"]`,
  `resolveTargets()` passes anything unknown through as a literal path (this is the
  CLI escape hatch S1 deliberately preserves).

### F. Lifecycle (**R9**, rides with R2)

`src/cli.ts:85–91`:

```ts
const shutdown = () => {
  deregisterRoom(registryPath, entry.id);           // ← runs FIRST
  void handle.close().then(() => process.exit(0));  // ← drains open connections
};
```

`handle.close()` → `httpServer.close(cb)` (`serve.ts:95`), which waits for open
connections; an attached TUI holds an SSE stream, so the process outlives SIGTERM
while already deregistered. `runMcp`'s shutdown (`cli.ts:165–169`) has the same
`httpServer.close()` shape without the deregister.

### G. Packaging (**R4**, S4)

`package.json`:
- `bin: { "roomyx": "./src/cli.ts", "roomyx-client": "./src/client/index.ts" }` — both
  `.ts` with a bun shebang. R4 replaces these with node-shebang launchers.
- `files: ["src", "LICENSE", "README.md", "package.json"]` — new launcher files must
  land **inside `src/`** or `files` must be extended. `cli.ts:172–178` `version()`
  reads `../package.json` relative to `import.meta.dir`, which is why `package.json`
  is in `files`.
- `engines: { "bun": ">=1.1.0" }` — verified to enforce nothing (npm's engine check
  knows only `node`/`npm`).
- `dependencies` use caret ranges: `@modelcontextprotocol/sdk ^1.0.0`,
  `@opentui/core ^0.5.11`, `zod ^4.5.4`.
- `README.md:18–19` documents the Bun-on-PATH requirement (R4's "documented failure
  mode" dissent). `README.md:36/42` carry `serve`'s published port behaviour.

`import.meta.dir` / `import.meta.main` are used in `cli.ts:47,174` and
`client/index.ts:132` — a node launcher must `exec` bun, not run these under node.

### H. Room creation (**R3**, owner-gated)

`src/cli/seed.ts` is the only writer of a room log: `init` (line 43) writes the state
header, `append` (line 59) appends a message, `nextSeq()` (`:29–38`) re-reads the whole
file. It is **not in `bin`**, has zero README mentions, and has no test file.
`docs/roomyx/testing-story.md` invokes it as
`bun "$(npm root -g)/@mrciphersmith/roomyx/src/cli/seed.ts"`.

R3 = promote to `roomyx room new|append`, with `listLiveRooms()`-based refusal on
`append` against a live room + `--force`. **Gated on a D-01 amendment landing in
`docs/roomyx/decisions.md` first.**

### I. Transcript volume (**R10**)

- `src/server/index.ts:56–66` — `room.get_transcript` inputSchema is
  `{ since_seq: z.number().int().min(0) }` only. No `limit`, no cursor.
- `src/log/store.ts:49–81` `loadRoomLog()` — full read + per-line zod validate on
  **every** tool call; `src/server/tools/*.ts` call it per request.
- `src/log/store.ts:84–86` `getTranscript()` — plain `filter`.

---

## Test Suite: What It Asserts, and the Blind Spots

Location convention: `test/` mirrors `src/` (`test/client/`, `test/server/`,
`test/installer/`, `test/log/`, `test/mcp-management/`), plus two top-level
CLI-subprocess suites. No co-location. Fixtures in `test/fixtures/`
(`sample-room.jsonl`, `bundled-skill.md`).

| Suite | Covers |
|---|---|
| `test/server/serve.test.ts` (122) | ephemeral bind, real `StreamableHTTPClientTransport` round-trips for all three read tools, non-loopback refusal + acknowledged converse, never-writes-the-log (content **and** mtime), **multiple sequential sessions** against one instance |
| `test/server/tools.test.ts` (65) | the three tool functions directly, incl. no-write assertion |
| `test/server/owner-command.test.ts` (101) | no-dispatcher refusal, dispatcher forwarding, kind-enum rejection, no log write |
| `test/log/store.test.ts` (111) | header parse, message order, invalid-kind and missing-field rejection, no on-disk mutation, `getTranscript` boundaries, `getAgentDetail` found/not-found |
| `test/client/mcp-client.test.ts` (99) | connect + state, exactly-once delivery across poll cycles, disconnected state when unreachable, recovery to connected |
| `test/client/render.test.ts` (106) | real `createTestRenderer` + real `serve()`; asserts roster names, goal statement, `"connected"`; modal open on Enter and close on Escape |
| `test/client/owner-prompt.test.ts` (116) | the whole prompt state machine, pure-function style |
| `test/installer/registry.test.ts` (189) | register/deregister/list, un-initialized project, real liveness prune, **real cross-process concurrency via `Bun.spawn`**, stale-lock reclaim, token-ownership release |
| `test/installer/skill-sync.test.ts` (114) | all six sync paths incl. pre-existing-content regression and dryRun |
| `test/installer/init.test.ts` (53) | config/registry creation, staged skill copy, non-clobber of non-empty registry, idempotence |
| `test/installer/skill-targets.test.ts` (28), `resolve-connection.test.ts` (81) | target resolution; `--connect`/`--room`/auto-attach/zero/multiple |
| `test/mcp-management/server.test.ts` (120) | both tools over real MCP round-trips, neither-arg refusal, no-write assertion, multiple sessions |
| `test/cli-commands.test.ts` (191) | subprocess CLI: unknown-command usage, `--version`, client-with-no-rooms exit, `roomyx mcp` reachable, six `skills sync` cases |
| `test/cli-serve-lifecycle.test.ts` (79) | subprocess `serve`: register-on-start + deregister-on-SIGTERM, absolute-logPath normalisation |

### Blind spot 1 — render tests never assert a message body

`test/client/render.test.ts:78–84` asserts `"Юки"`, `"Омар"`, `"Зара"`,
`"roomyx MCP server MVP"` (the goal statement), `"connected"`. **No assertion that any
`message.body` text appears in the frame.** The modal test at `:96–99` deliberately
asserts the modal *title* precisely because body text "also legitimately appears in
the background chat view" — i.e. the suite reasons about bodies and still never
asserts one. This is why R1 shipped in 0.4.0.

R1's acceptance criterion is specifically **a test that fails when seq 1 is not
drawn** — write it against the current code first.

### Blind spot 2 — serve lifecycle only tests the unattached case

`test/cli-serve-lifecycle.test.ts:43–61` spawns `serve`, waits for the registry entry,
sends SIGTERM, `await proc.exited`, asserts the registry is empty. **No client is
attached**, so `httpServer.close()` has nothing to drain and the test is green while
R9's documented case (attached TUI, still alive 30 s later) is broken. The R9 test
needs a `RoomClient` (or raw `StreamableHTTPClientTransport`) connected before the
signal, plus a timeout assertion on `proc.exited`.

### Other gaps worth naming

- No test file for `src/cli/seed.ts` (R3 will need one).
- No test asserts `--help`, exit codes for help, or flag-grammar errors (R8).
- No test asserts `isError` handling in `callTool` (R2).
- No test exercises Origin/Host headers or session-map growth (S2/R5).
- `test/mcp-management/server.test.ts:81` ("refuses when given neither target nor
  targetPath") is coupled to the `targetPath` parameter S1 removes.

### Test conventions to follow

- `import { afterEach, describe, expect, test } from "bun:test"` — explicit imports,
  no globals. `describe` → `test`, one level.
- Real integration over mocks: tests spin up real `serve()` instances on `port: 0`,
  real SDK clients, real subprocesses (`Bun.spawn`). **No mocking library is used
  anywhere** — no `vi`/`jest.fn`/`sinon`.
- Temp dirs via `mkdtempSync(join(tmpdir(), "roomyx-…-"))`, cleaned in `afterEach`
  with `rmSync(dir, { recursive: true, force: true })`.
- Handles tracked in module-level `let activeHandle` / `procs[]` and closed in
  `afterEach`.
- Subprocess timing uses poll-until-deadline helpers (`waitForRegistration`,
  `waitForStdout`) rather than fixed sleeps; per-test timeout passed as the 3rd
  `test()` argument (e.g. `10000`).
- Render tests use `createTestRenderer({ width, height })` then
  `renderOnce()` + `captureCharFrame()`. `waitFor`, `waitForFrame`,
  `waitForVisualIdle`, `flush`, `resize` are also available and currently unused —
  `waitForFrame(frame => frame.includes(body))` is the natural R1 assertion.
- Test names state the AC/finding they cover in parentheses, e.g. `(AC3)`,
  `(regression, real subprocess concurrency)`.

---

## Codebase Conventions

- **Comments carry decisions.** Nearly every non-obvious block has a paragraph
  explaining *why*, often naming the decision (`D-01`, `D-06`) or the review that
  found the bug ("an independent review reproduced this concretely"). Fixes are
  expected to extend this, not strip it.
- Imports: `node:*` prefixed builtins first, then third-party, then relative. Types
  imported with `import type`.
- Errors: messages, not objects, at the CLI boundary
  (`cli.ts:205–208`, `client/index.ts:133–139`); error strings **name the file path**
  (`store.ts`, `registry.ts`) — `store.ts:58` is the one place that doesn't (R2).
- `process.exit(1)` for user error after a `console.error`; usage goes to stderr.
- Zod schemas defined at module top, `safeParse` + explicit throw with a
  human-readable message (never a bare `.parse()`).
- Filesystem writes are write-temp-then-rename (`registry.ts:126–130`) and
  backup-before-overwrite (`skill-sync.ts:83–86`).
- Renderables: one `Renderable` per row, `height: 1`, rebuilt wholesale on data
  change; components expose `node` as `readonly` and a small imperative API
  (`setRoster`, `setNotice`, `show`/`hide`).
- Pure state machines are extracted and unit-tested separately
  (`src/client/owner-prompt.ts` ← `test/client/owner-prompt.test.ts`). **A scroll
  state machine for R1 should follow this pattern.**
- Docs live in `docs/roomyx/` and `docs/roomyx-installer/`; decisions are numbered
  `D-0N` with *Решение / Причина / Отвергнутая альтернатива* (Russian prose).

---

## Libraries & APIs

### `@modelcontextprotocol/sdk` — declared `^1.0.0`, **installed 1.30.0** (`bun.lock:55`)

**Correction to the backlog's S2 note — verify before sizing S2.** The backlog says
`enableDnsRebindingProtection`/`allowedHosts`/`allowedOrigins` "appear in `server/sse.js`
and `server/webStandardStreamableHttp.js` — and not once in `server/streamableHttp.js`".
That grep is accurate but misleading at 1.30.0: `server/streamableHttp.js` is now a
**thin wrapper** that does `new WebStandardStreamableHTTPServerTransport(options)`
(`dist/esm/server/streamableHttp.js:52`) and its options type is declared as
`export type StreamableHTTPServerTransportOptions = WebStandardStreamableHTTPServerTransportOptions`
(`streamableHttp.d.ts:21`). The guard runs in
`webStandardStreamableHttp.js:139–163 validateRequestHeaders()`, called from
`handleRequest` before method dispatch, returning **403** with JSON-RPC code `-32000`.

Consequence: at 1.30.0 the constructor option **does** reach the transport roomyx
constructs, so S2 may be a two-line option addition per transport rather than a
hand-written handler check. **But** `^1.0.0` means a fresh install can resolve any
1.x — under an older 1.x the wrapper refactor may not exist. Decide deliberately:
either pin/raise the SDK floor and use the option, or implement the check in roomyx's
own `createServer` handler (version-independent). Note the Origin check only fires
when an `Origin` header is present; the Host check rejects a missing header outright.

Other verified SDK behaviour relevant to the backlog:

- `onsessionclosed` fires **only** from `handleDeleteRequest`
  (`webStandardStreamableHttp.js:714`). A client `close()` never sends DELETE →
  the entry stays in `sessions` forever (R5's leak).
- `StreamableHTTPClientTransport.terminateSession(): Promise<void>` exists
  (`client/streamableHttp.d.ts:157`) — this is R5's replacement for `close()` in
  `registry.ts:229` and `mcp-client.ts:56`.
- Documented stateful-mode contract (`streamableHttp.d.ts:48–52`): invalid session id
  → **404**; non-init request with no session id → **400**. roomyx's handler bypasses
  this by minting a transport instead of delegating the unknown id (R5).
- One transport completes exactly one `initialize` for its lifetime — this is why the
  per-session transport+server pair exists; do not collapse it.
- SDK pulls in `express`, `hono`, `@hono/node-server`, `cors`, `jose`, `ajv`. The
  `bun audit` step in CI runs over this tree.

### `@opentui/core` 0.5.11

`ScrollBoxRenderable` (`renderables/ScrollBox.d.ts`) — everything R1 needs already exists:

- Options: `stickyScroll`, `stickyStart: "bottom"|"top"|"left"|"right"`, `scrollX`,
  `scrollY`, `viewportCulling`, `scrollbarOptions` / `verticalScrollbarOptions`.
- Accessors: `get/set stickyScroll`, `get/set stickyStart`, `get/set scrollTop`,
  `get scrollHeight`, `get scrollWidth`.
- Methods: `scrollBy(delta, unit?)`, `scrollTo(position)`, `scrollChildIntoView(childId)`,
  `handleKeyPress(key): boolean`, `getChildren()`, `remove(child)`.
- `ScrollUnit = "absolute" | "viewport" | "content" | "step"` — `scrollBy(±1, "viewport")`
  is the natural PgUp/PgDn; `"step"` for Ctrl-U/Ctrl-D half-pages via a step setting.
- Sub-renderables are public: `wrapper`, `viewport`, `content`, `verticalScrollBar`.
  `ScrollBarRenderable` has a private `_manualVisibility` — check whether it is settable
  through `scrollbarOptions` before hand-rolling the "hide the thumb when empty" fix.
- `stickyScroll` internally tracks `_hasManualScroll` / `isAtStickyReengagePoint` —
  the "suspend sticky while scrolled up, resume at bottom" behaviour R1 asks for may
  be partly free; test before reimplementing.

`TextRenderable` / `TextBufferOptions` (`renderables/TextBufferRenderable.d.ts:10–21`) —
R1's wrapping primitive and R12's:

- `wrapMode?: "none" | "char" | "word"` (default `"none"`), `truncate?: boolean`,
  plus `fg`, `bg`, `attributes`, `selectable`.
- **Removing the hardcoded `height: 1` in `message-row.ts` and setting
  `wrapMode: "word"` is the mechanism** — no hand-rolled wrapper needed. R12 should
  inherit the same primitive in `status-bar.ts` rather than write a second one.

`@opentui/core/testing` (`testing/test-renderer.d.ts`) — `createTestRenderer` returns
`{ renderer, mockInput, mockMouse, renderOnce, flush, waitFor, waitForFrame,
waitForVisualIdle, externalOutput, getNativeStats, captureCharFrame, captureSpans, resize }`.
`mockInput` provides `pressArrow`, `pressEnter`, `pressEscape` (used today); it is
`createMockKeys(...)` so other key presses are available for the PgUp/PgDn tests.

### `zod` ^4.5.4

Used for log-line schemas (`log/store.ts`), the registry file schema
(`installer/registry.ts:7–18`), and MCP tool `inputSchema` objects
(`server/index.ts`, `mcp-management/server.ts`). MCP `inputSchema` is a **plain object
of zod validators**, not `z.object({...})` — match that shape when adding `limit`
(R10) or a `room.health` tool (R7).

---

## CI / Release

`.github/workflows/ci.yml` (push to `main` + every PR):
`actions/checkout@v4` → `oven-sh/setup-bun@v2` (bun-version: **latest**) →
`bun install --frozen-lockfile` → `bun test` → `bunx tsc --noEmit` →
`bunx eslint src test` → `bun audit`.

`.github/workflows/release.yml` (tag `v*` only, no `workflow_dispatch`):
checkout → setup-bun → setup-node 22 + npm registry → force `npm@11` with a `>= 11`
floor assertion → **`bun install`** (bare — this is **S4**; CI uses `--frozen-lockfile`)
→ tag-vs-`package.json` version guard → `bun run check` → `npm pack` + install the
tarball globally + `./.release/prefix/bin/roomyx --help > /dev/null 2>&1 || true` →
`npm publish --provenance --access public` (OIDC trusted publishing, no token) →
`gh release create --generate-notes` with the tarball.

Two things the backlog touches here:
- **S4** is literally `bun install` → `bun install --frozen-lockfile` in the release job.
- The smoke test runs `roomyx --help` and swallows the result with `|| true`. Today
  `--help` is an unknown command that exits 1 — after R8 gives it real semantics, the
  `|| true` should go, turning the smoke step into a real assertion. R4 changes what
  `bin/roomyx` even is, so that step is the natural place to prove the launcher works.

Permissions: `contents: write`, `id-token: write`. Trusted publishing is registered for
`MrCipherSmith/roomyx` + `release.yml` — **renaming the release workflow file breaks
publishing.**

---

## Decisions & Gates

Recorded decisions live in `docs/roomyx/decisions.md` (D-01..D-06) and
`docs/roomyx-installer/decisions.md` (D-01..D-04). Both are in Russian, format
*Решение / Причина / Отвергнутая альтернатива*.

| Decision | Bears on |
|---|---|
| roomyx **D-01** — server reads only; the dispatcher is the log's single writer | **R3 gate.** Amendment must land in `decisions.md` *before* `room new/append` ships: D-01 constrains the server not the package; invariant is one writer per live room; `room new` = writers 0→1; `room append` refuses when `listLiveRooms()` shows a live room on that path, `--force` overrides. |
| roomyx **D-06** — Streamable HTTP on loopback, no token in v1 | **S2 gate.** Amendment ships **in S2's commit**, not R5's: loopback binding does not constrain a browser; D-06's threat model enumerated process actors and never browsers; remedy is the rebinding guard, not the auth D-06 deferred. |
| roomyx **D-02** — MCP transport chosen over a file log | Constrains R3: no second home-grown command/file channel. |
| installer **D-01** — `init` is explicit, never a postinstall hook, no install-time network | **R4 hard criterion:** the launcher probes `PATH` and prints a URL; it must never fetch, install or bootstrap Bun. |
| installer **D-02** — real skill-file syncs need separate confirmation | Constrains S1/S3: the `--yes` semantics and the "never silently discard hand edits" rule. |
| installer **D-03** — registry liveness verified by fact, not by record | **R7 already asks for this** and the code does something weaker (port answers ≠ right room). |

There is **no recorded decision** about build steps, transpilation, shebangs or Bun —
grep of both decision files confirms it. The "ships TypeScript, no build step" stance
is README prose (`README.md:18–19`), so R4 needs a doc edit, not a carve-out.

Job-level decisions already registered in
`jobs/gproject-roomyx-backlog/decisions.md`: `D_mode = task_in_project`,
`D_source_of_truth = docs/roomyx/improvement-backlog.md`,
`D_ranking_axis = ranked order ≠ build order`, `D_decision_gates = R3→D-01, R5/S2→D-06`.

---

## Ordering Constraints Recorded on the Items

- **Build order:** ship-now (S1–S4) → R3 → R4 → R8 → R2 → R1. **Ranked by weight:**
  R1, R2, R8, R4, R5. Do not read the ranked list as a work queue.
- **S1 gets its own commit and changelog line** — not folded into another PR, so it
  cannot be reverted as collateral. S2 ships in the same PR as S1 (same attack path),
  carrying the D-06 amendment.
- **R1 must not merge without R2** — a polished blank pane is a wrong answer upgraded
  to a credible one.
- **Within R1:** `chat-view.ts:36` (scroll model) **before** `message-row.ts`
  (`height: 1`). Wrapping bodies first makes the symptom worse. Write the failing
  seq-1 test before either. The `chat-view.ts:36` fix is ~1 hour and independently
  shippable — split it out rather than letting it wait on the 3-day rewrite.
- **R9 rides with R2** — same function, six lines apart (`cli.ts:85–91`).
- **R10 splits**: `limit`+cursor has a present victim; `loadRoomLog` memoization is a
  follow-up.
- **R12 inherits R1's wrap primitive** rather than hand-rolling a second one.
- **R5 excludes the rebinding guard** (that is S2); R5 is the reaper + the amendment.

---

## Watch Areas

- `src/server/serve.ts` and `src/mcp-management/server.ts` are duplicated ~90%.
  Every transport fix (S2, R5) must be applied twice or the shape extracted — and
  four separate test suites (`server/serve`, `mcp-management/server`, `cli-commands`,
  `installer/registry`) construct these servers.
- `ConnectionStatus` is a three-value union consumed by an exhaustive record lookup in
  `status-bar.ts:40`. Widening it (R2's pane state) breaks that lookup silently at
  runtime and loudly under `strict`.
- `noUncheckedIndexedAccess` will reject naive `args[i]` parser code.
- Adding a `room.health` tool (R7) changes the tool list asserted nowhere today but
  printed by `cli.ts:163` for the management server — keep those in sync.
- `test/mcp-management/server.test.ts:81` must change with S1.
- The release smoke step's `|| true` masks CLI exit codes; R8 and R4 both make it
  meaningful.

## References

| Source | Where | Relevance |
|---|---|---|
| `docs/roomyx/improvement-backlog.md` | repo | HIGH — the 15 items, sizes, ordering, acceptance criteria |
| `brainstorm/roomyx-improvements-room.md` (77 KB) | repo | MEDIUM — full room transcript behind the backlog |
| `docs/roomyx/decisions.md`, `docs/roomyx-installer/decisions.md` | repo | HIGH — D-01/D-06 gates |
| `docs/roomyx/testing-story.md` | repo | MEDIUM — the walkthrough R1/R3/R9 are measured against (`:171` scroll promise) |
| `docs/roomyx/specification.md`, `prd.md` | repo | MEDIUM — AC numbering the tests cite |
| `node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.{js,d.ts}` | local | HIGH — guard + session-close semantics, read directly |
| `node_modules/@opentui/core/renderables/{ScrollBox,TextBufferRenderable}.d.ts` | local | HIGH — R1/R12 primitives |

Note: no MCP-server or web documentation was fetched — every library fact above was
read out of the installed `node_modules` at the exact versions this repo resolves,
which is stronger evidence than published docs for version-specific claims.

`metaproject: unavailable` — `/home/altsay/roomyx/.metaproject/` exists but contains no
`index.md` (only `data/`, `security/`, `raw/`, `hmac.key`, `state.json`).

---

| Key | Value |
|-----|-------|
| Created | 2026-09-09T11:04:03Z |
| Updated | 2026-09-09T11:04:03Z |
| Agent | context-collector |
| Task | Collect codebase context for the roomyx 0.4.0 15-item defect backlog |
| Job | gproject-roomyx-backlog |
| Version | 1.0 |
| Status | final |

## Update Log
- v1.0 (2026-09-09T11:04:03Z): Initial context. Agent: context-collector.
