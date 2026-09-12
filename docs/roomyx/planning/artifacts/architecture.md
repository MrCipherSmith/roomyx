# Architecture: roomyx 0.4.0 defect remediation

Job: `gproject-roomyx-backlog` · Phase 3 · mode `task_in_project`
Inputs: `artifacts/stack-decision.md` (binding), `artifacts/problem-statement.md`, `ai/context.md`, the repo at `/home/altsay/roomyx`

> `metaproject: unavailable` — carried forward from Phase 0/1/2.

---

## 0. What this document is

**There is no architecture to invent.** roomyx 0.4.0 has a shape; ten scheduled
fixes have to fit inside it. This document does three things:

1. Records the existing layering and module boundaries **as they are**, so the PRD
   cannot silently re-draw them.
2. Names the **seams** each cluster of work cuts through, with line anchors.
3. Where a fix has a genuine structural choice, **names the choice and rules on it
   with evidence.** Two such choices were handed to this phase explicitly (§4, §5).
   Both are ruled. Both rulings are backed by things that were **run**, not read.

Everything measured in §4 and §5 was executed against the installed
`node_modules` in a scratch directory. **Nothing in `/home/altsay/roomyx` was
modified.**

---

## 1. The existing architecture, recorded as fact

### 1.1 Pattern: simple layered, feature-foldered, no framework

roomyx is a **layered CLI + two MCP servers over loopback HTTP**, organised by
feature folder under `src/`. There is no DI container, no repository pattern, no
service layer abstraction. `bun run check` is the only gate. This matches
`D_level` (published solo-maintainer 0.x dev tool) exactly, and **is not to be
upgraded** by this remediation (`NG4`, `NG6`).

**Alternative considered and rejected:** introducing a transport/domain/adapter
split (hexagonal) to give S2 and R5 a clean insertion point. Rejected — it would
be an architecture invented for a 15-item defect list, it contradicts `NG4`, and
§4 shows the same benefit is available from a 70-line function extraction.

### 1.2 Layers and dependency direction

```
  bin (package.json)                    roomyx → src/cli.ts
                                        roomyx-client → src/client/index.ts
        │
        ▼
  ENTRY / COMMAND            src/cli.ts            src/client/index.ts   src/cli/seed.ts
    parseFlags, dispatch,    (3 divergent parser copies — R8's target)
    process.exit, USAGE
        │
        ├──────────────┬────────────────────┬──────────────────┐
        ▼              ▼                    ▼                  ▼
  TRANSPORT      TUI PRESENTATION      INSTALLER          LOG ACCESS
  src/server/    src/client/           src/installer/     src/log/
    serve.ts       screens/              init.ts            store.ts
  src/mcp-        components/            registry.ts        types.ts
   management/     mcp-client.ts         skill-sync.ts
     server.ts                           skill-targets.ts
        │                                resolve-connection.ts
        ▼                                       │
  MCP TOOL SURFACE                              │
  src/server/index.ts + tools/                  │
        │                                       │
        └───────────────┬───────────────────────┘
                        ▼
                  src/log/store.ts   (read-only; D-01: the server never writes)
```

**Dependency rules that hold today and must keep holding:**

| Rule | Evidence | Bound items |
|---|---|---|
| `log/` imports nothing from `server/`, `client/`, `installer/` | leaf module | R2, R3, R10 |
| `server/` (tool surface) reads the log, never writes it | roomyx **D-01**; asserted by three separate no-write tests | R3 (the gate), R10 |
| `client/` reaches the server **only** through `mcp-client.ts` | `screens/` and `components/` take plain data | R1, R2 |
| `installer/registry.ts` is the only reader/writer of `registry.json` | write-temp-then-rename at `:126–130` | R2, R5, R7 |
| entry layer owns `process.exit` and stderr; deeper layers throw | `cli.ts:205–208`, `client/index.ts:133–139` | R8, R4, R2 |
| the TUI never reaches into a component's internals | components expose `node` readonly + a small imperative API | **R1 (binding)** |

**The one violation this remediation must not introduce:** R1 needs scrolling.
`ChatView.scroll` is `private` (`chat-view.ts:20`). The fix **adds a method to
`ChatView`**; `client/index.ts` must not be given the `ScrollBoxRenderable`. See
§5.4.

### 1.3 Module boundaries the fixes cut across

| Seam | Files | Items | Nature of the seam |
|---|---|---|---|
| **A. Flag grammar** | `cli.ts:20–36`, `client/index.ts:12–22`, `cli/seed.ts:17–27` | R8 (+R3) | three copies of one function, three different bare-flag semantics (`true` / `""` / `""`) |
| **B. HTTP transport** | `server/serve.ts:35–102`, `mcp-management/server.ts:107–175` | S2, R5 | **~90% duplicated — §4 rules on this** |
| **C. MCP tool schema** | `mcp-management/server.ts:49–88`, `server/index.ts:56–66` | S1, R10 | plain object of zod validators, not `z.object()` |
| **D. Render/scroll** | `chat-view.ts:36`, `message-row.ts:6–11`, `client/index.ts:84–129` | R1 — **§5 rules on this** | private `scroll` + a keypress router that already owns `up`/`down` |
| **E. Connection state** | `mcp-client.ts:69–73,113–118`, `status-bar.ts:40`, `chat-view.ts:40` | R2 | a 3-value union consumed by an exhaustive record |
| **F. Serve lifecycle** | `cli.ts:58–91`, `installer/registry.ts` | R2 (+R9 ride-along) | bind → register ordering; deregister-before-close |
| **G. Skill write path** | `installer/init.ts:44` vs `skill-sync.ts:46–100` | S3 | `init.ts` imports only `node:fs` — **it does not import `skill-sync` at all**; S3 introduces that edge |
| **H. Launcher** | `package.json` `bin`/`files`, `cli.ts:47,174`, `client/index.ts:132` | R4 | **two different `import.meta` properties.** `import.meta.dir` at `cli.ts:47,174` must keep resolving; `import.meta.main` at `client/index.ts:132` must keep evaluating **false** under `await import()` — see §6 A10 |

---

## 2. Cross-cutting concerns (as they exist — do not re-invent)

- **Authentication:** *none, deliberately* (roomyx **D-06**). The S2 guard is
  **not** authentication and must not be documented as such
  (`D_guard_scope`). It refuses browsers; it does not refuse local processes.
- **Authorization:** none. The only privilege boundary is loopback binding plus
  the `--acknowledge-non-loopback` escape hatch.
- **Error handling:** throw a `Error` with a human-readable message naming the
  file path; the entry layer prints `error.message` (never the object) and
  `process.exit(1)`. `store.ts:58` is the one place that omits the path — R2's.
- **Validation:** zod at the boundary only. `safeParse` + explicit throw. Never a
  bare `.parse()`. MCP `inputSchema` is a plain object of validators.
- **Logging/observability:** none, and none is to be added (`NG6`).
- **Decisions-as-comments:** every non-obvious block carries a paragraph saying
  *why*, often naming `D-01`/`D-06`. Fixes extend those comments; they never
  strip them. This is load-bearing here — it is how P8 gets partially repaired.
- **Testing:** integration-first. Real `serve()` on `port: 0`, real SDK clients,
  real `Bun.spawn`. **Zero mocking libraries** (`D_no_mocking`). Pure state
  machines are the one thing extracted and unit-tested in isolation
  (`owner-prompt.ts` ← `owner-prompt.test.ts`).

---

## 3. Test-pyramid shape (descriptive, not a target to hit)

The existing 17 suites are roughly: **60% integration** (real server + real
client), **25% subprocess/e2e** (`Bun.spawn` against the CLI), **15% pure unit**
(`owner-prompt`, `skill-targets`, parts of `store`). This remediation does not
change the ratio. Do not add a unit-test layer to hit a number; add the test
whose failure mode matches the finding.

---

## 4. RULING A — the duplicated transport: **extract once, first**

### 4.1 The question

`src/server/serve.ts` (102 lines) and `src/mcp-management/server.ts` (175 lines)
are near-identical. S2 (the Origin/Host guard) and R5 (the unknown-session-id
404 + session reaper) both change both. Extract the shared shape once, or apply
every change twice?

### 4.2 The measurement

**Measured diff of the two function bodies** (`serve.ts:35–102` vs
`mcp-management/server.ts:107–175`, 68 vs 69 lines):

```
5 hunks total. One is pure whitespace (`if (!res.headersSent)` braces).
The four real differences are:
  1. signature / options shape  (ServeOptions vs ManagementOptions+ManagementServeOptions)
  2. error label                ("roomyx serve" vs "roomyx mcp")
  3. McpServer factory          createRoomMcpServer(logPath, {onOwnerCommand})
                                vs createManagementMcpServer(options)
  4. default port               4319 vs 4320
```

Everything else — `LOOPBACK_HOSTS`, the non-loopback refusal, the `sessions` map,
`createSession()`, the `createServer` handler, the listen-with-cleanup, the
address/port readback, and `close()` — is **byte-identical modulo whitespace.**

**Measured test coupling.** The premise carried into this phase (stack-decision
C4: *"four test suites construct these servers"*) was checked and is **wrong in
both directions**:

```
grep -rl "serve(|serveManagement(" test/   →  7 files, not 4:
  test/server/serve.test.ts          test/server/owner-command.test.ts
  test/client/render.test.ts         test/client/mcp-client.test.ts
  test/installer/registry.test.ts    test/installer/resolve-connection.test.ts
  test/mcp-management/server.test.ts

grep -rn "LOOPBACK_HOSTS|createSession|httpServer" test/   →  0 matches
```

**Seven** suites construct these servers, and **not one imports an internal.**
Every one of them goes through `serve(logPath, options)` or
`serveManagement(options, serveOptions)`.

### 4.3 The ruling

> **Extract `src/server/http-transport.ts` once, before S2 and R5 touch anything.
> `serve()` and `serveManagement()` keep their exact current signatures and become
> thin adapters over it.**

```ts
// src/server/http-transport.ts  — the whole shared shape, parameterised on 4 things
export interface McpHttpTransportOptions {
  createMcpServer: () => McpServer;   // difference 3
  defaultPort: number;                // difference 4
  commandLabel: string;               // difference 2 — "roomyx serve" | "roomyx mcp"
  port?: number;
  host?: string;
  acknowledgeNonLoopback?: boolean;
}
export interface McpHttpHandle { url: string; port: number; close(): Promise<void>; }
export async function serveMcpOverHttp(o: McpHttpTransportOptions): Promise<McpHttpHandle>
```

`ServeOptions`, `ServeHandle`, `ManagementOptions`, `ManagementServeOptions` and
`ManagementHandle` **all stay exported from where they are today** (difference 1
is absorbed by the adapters, not by the callers).

### 4.4 What it costs, honestly

| Cost | Value | Basis |
|---|---|---|
| Test files edited | **0** | §4.2: no test imports an internal; both public signatures are preserved |
| Net new files | 1 (`src/server/http-transport.ts`, ~75 lines) | it already exists, twice |
| Net line change | ≈ −90 | two 68-line bodies → one 75-line body + two ~10-line adapters |
| New public API surface | **0** | `serveMcpOverHttp` is internal to `src/server/`; not in `bin`, not in a tool schema, not in the README |
| Sizes disturbed | **none** | the extraction is a *separate commit before* S2; S2 and R5 then each shrink to one edit instead of two |
| Risk | low, and self-checking | the extraction is behaviour-preserving by construction, and 7 existing suites prove it without being touched |

### 4.5 Why this beats "apply every change twice", against the stated constraint

The constraint handed to this phase was: *the room's sizes were priced against one
file, this is solo-maintained, and an extraction touches four test suites.*

- **"Touches four test suites" is false.** It touches zero. That was the whole
  weight of the objection and it does not survive the grep.
- **"Priced against one file" cuts the other way.** If sizes were priced against
  one file, then *apply-twice* is the option that breaks the pricing — it doubles
  the edit surface of S2 and R5. Extract-once is what makes the prices honest.
  **This is not a re-estimate** (`D_no_reestimate`): it does not change any item's
  number; it makes the extraction a separate, previously-unpriced commit and
  leaves S2 and R5 at the size they were priced at.
- **Solo-maintenance is an argument *for* extraction, not against.** `K4` ("a
  transport fix lands in one of the two servers") has probability M and impact H
  precisely because there is no second reviewer to catch the missed file. A
  solo maintainer's only defence against a two-file invariant is deleting the
  invariant. `D_transport_duplication` says *"every transport fix lands in two
  files **or an extraction first**"* — this is the second branch, taken.
- **The security asymmetry is decisive.** If S2 is applied twice and one copy is
  missed, the result is a security fix that appears to have shipped and did not,
  on a signed immutable tarball, in the one finding that has a real adversary.
  Apply-twice puts that outcome one lapse of attention away, permanently, for
  every future transport change too.

### 4.6 Ordering and blast radius

```
commit 1: extract src/server/http-transport.ts   (behaviour-preserving, 0 test edits)
commit 2: S1  (targetPath removal — own commit, per problem-statement)
commit 3: S2  (guard, one edit in http-transport.ts) + the D-06 amendment
    …
later:    R5  (404 + reaper, one edit in http-transport.ts)
```

Commit 1 belongs in **S2's PR**, not its own, so the PR that carries the security
fix also carries the proof that the fix is unmissable. It must be a **separate
commit** so a revert of S2 does not revert the extraction (mirroring the reason
S1 keeps its own commit).

### 4.7 Two structural details the extraction must get right

**(a) The guard's allowlists depend on the bound port, which is not known until
after `listen()`.** Measured against the installed SDK 1.30.0: `allowedHosts` is
an **exact string match against the full `Host` header, including the port.**

```
allowedHosts: ["127.0.0.1", "localhost"]            → 403 "Invalid Host header: 127.0.0.1:39011"
                                                       ON ROOMYX'S OWN CLIENT
allowedHosts: [`127.0.0.1:${p}`, `localhost:${p}`]  → 200
```

Since `serve` moves to an **ephemeral default port** under R8, and the SDK
transport is constructed per-request inside `createSession()` (which runs after
`listen()`), the extraction must capture the bound port in a closure variable and
build the allowlists lazily inside `createSession()`. A naive
`allowedHosts: [host]` written at option-construction time **bricks the product**.
This is the same class of error as the rejected `>=1.13.3` floor.

**(b) Host and Origin defend different things and both are required.**
Measured: a browser hitting `http://127.0.0.1:<port>/mcp` sends a *legitimate*
`Host` header — `allowedHosts` alone does not stop it; `allowedOrigins` does. A
DNS-rebound page sends `Host: attacker.example` — `allowedOrigins` alone does not
stop it (the origin is now same-origin); `allowedHosts` does. Configure both.

---

## 5. RULING B — the scroll fix: **the primitive already does it. R1 shrinks.**

### 5.1 The question

`@opentui/core@0.5.11`'s `ScrollBoxRenderable` has `stickyScroll` and an internal
`_hasManualScroll`. `testing-story.md:171` promises that scrolling up is not
overridden by new messages. Does the primitive already satisfy it, or must a
state machine be built?

**Instruction: do not reason from the source alone; render it.** It was rendered.

### 5.2 What was run

`@opentui/core/testing`'s `createTestRenderer`, headless, against the installed
0.5.11 — first with a bare `ScrollBoxRenderable` configured exactly as
`chat-view.ts:36` configures it, then against **the real `ChatView` class imported
from `src/`**. 5 experiment suites, 19 scenarios. Verbatim results below.

### 5.3 Result 1 — sticky suspend/resume: **already free. Zero code.**

```
=== at bottom, scrollTop 20 max 20          rows msg-021 … msg-030
scroll.scrollBy(-10)
=== after scrollBy(-10), scrollTop 10       rows msg-011 … msg-020
add 5 new messages, render
=== after 5 new msgs, scrollTop 10          rows msg-011 … msg-020   ← IDENTICAL
STAYED PUT: true
```

and re-engagement:

```
scrolled to bottom again (scrollTop 20 == max 20); 3 new messages arrive
=== reengage: scrollTop before 20 after 23 max 23   rows msg-024 … msg-033
```

Re-verified through the whole R1 shape at once (wrapped rows + hidden h-bar +
key-driven scroll):

```
bottom=13   afterPageUp=7   afterNewMsg=7   heldPosition=true
afterEnd+new: st=15 max=15 reengaged=true
```

> **`testing-story.md:171`'s promise is satisfied by the library, unmodified, the
> moment a key is bound to it.** `_hasManualScroll` is set by every public
> mutation path (`scrollTop` setter, `scrollBy`, `scrollTo`, wheel, `handleKeyPress`)
> and cleared by `isAtStickyReengagePoint` with a one-row tolerance. **No state
> machine is to be written.** Building one would be a second, worse implementation
> of code that is already there and already correct.

### 5.4 Result 2 — the keys already exist too

`ScrollBoxRenderable.handleKeyPress(key): boolean` delegates to
`ScrollBarRenderable.handleKeyPress`, which handles — measured, returning `true`
and moving `scrollTop` — `up` / `k`, `down` / `j`, `pageup`, `pagedown`, `home`,
`end`. Each call routes through `syncManualScrollState()`, so **sticky suspension
is maintained by the library for key-driven scrolling as well as programmatic.**

**Structural choice, ruled.** `client/index.ts:120–121` already binds `up`/`down`
to `chatView.roster.moveSelection`. Two claimants, one pair of keys.

> **Ruling: the roster keeps `up`/`down`. The transcript gets `pageup`/`pagedown`
> /`home`/`end`, routed through a new public `ChatView.handleTranscriptKey(event):
> boolean`.**
>
> Reasons: (a) changing `up`/`down` is a behaviour change to a shipped surface,
> and this backlog has three of those already (`P9`) — a fourth, unforced one is
> not free; (b) `roster.moveSelection` feeds `confirmSelection` → the agent modal,
> which is the roster's only interaction path, so taking its keys removes a
> feature (`NG4`); (c) `pageup`/`pagedown` are what
> `ScrollBar.handleKeyPress` already implements as half-viewport steps, so the
> binding is a delegation, not a mapping.
>
> `ChatView.scroll` **stays private.** The method delegates; `client/index.ts`
> never sees the `ScrollBoxRenderable`. This preserves §1.2's last rule.

### 5.5 Result 3 — the seq-1 defect is real, and it is *not* the scroll model

Against the **real `ChatView`**, 3 messages in an 80×12 terminal, one render:

```
n=3: vp=11 content=11 sh=11 st=0 | frame1 has body-001: false | frame2: true

[connected] undefined
> Юки                   Юки: body-002        ← body-001 is simply gone
  Омар                  Юки: body-003
```

Root cause, isolated by bisection over five candidate configurations:

```
baseline                                  n=3: vp=11 content=12 st=1  seq1 drawn=false
scrollX:false                             n=3: vp=11 content=12 st=1  seq1 drawn=false
horizontalScrollbarOptions:{visible:false} n=3: vp=12 content=12 st=0  seq1 drawn=TRUE
scrollX:false + hbar hidden               n=3: vp=12 content=12 st=0  seq1 drawn=TRUE
contentOptions flexGrow:0/flexShrink:0    n=3: (no effect)            seq1 drawn=false
```

> **The horizontal scrollbar renderable occupies one viewport row.** That makes
> `viewport.height` one less than the pane, so `recalculateBarProps` computes
> `maxScrollTop = content.height − viewport.height = 1` **even when the content
> under-fills the pane**, and `stickyStart: "bottom"` dutifully scrolls down by
> exactly one row. Seq 1 falls off the top of a pane that had room for it.
>
> **The fix is one option on `chat-view.ts:36`:
> `horizontalScrollbarOptions: { visible: false }`.** `scrollX: false` alone does
> **not** work — measured; the bar renderable still takes its row. Transcript text
> wraps rather than scrolling sideways, so a horizontal scrollbar has no job here.

This also removes the permanently-drawn vertical scrollbar column: with
`content.height` no longer pinned to `viewport.height`,
`ScrollBar.recalculateVisibility()`'s `sizeRatio < 1` test starts returning false
on under-filled panes, and the thumb hides itself. The "hide the thumb when
empty" note in `ai/context.md` needs no separate work.

### 5.6 Result 4 — wrapping is one option, as predicted

```
scroll.add(new TextRenderable(ctx, { content: "a2: …", wrapMode: "word" }))   // no height

a1: first message, seq 1
a2: a much longer second message that has t
wrap across more than one row to be readabl
at all
a3: third
```

`content.height` accounts for wrapped rows, so sticky-bottom arithmetic stays
correct across wrapped content. Confirms `D_opentui_primitives`.

### 5.7 What R1 actually is, after measurement

| Sub-task | Before this phase | After measurement |
|---|---|---|
| failing seq-1 test | write it red first | unchanged — **still first** |
| sticky-bottom off-by-one | "the scroll model at `chat-view.ts:36`" | **one option: `horizontalScrollbarOptions: { visible: false }`** |
| scroll state machine (suspend/resume on new messages) | build it, unit-test it like `owner-prompt.ts` | **DELETE — the library already does it, measured** |
| key bindings | build + bind | **delegate to `scroll.handleKeyPress` via a new `ChatView` method**; bind `pageup`/`pagedown`/`home`/`end` |
| body wrapping | `wrapMode: "word"`, drop `height: 1` | unchanged, confirmed |
| `kind` + `in_reply_to` in the row | unchanged | unchanged |
| empty / error pane states | unchanged (`setEmpty`/`setError` on `ChatView`) | unchanged |

**Size claim, made explicitly and with evidence, under the one exception
`D_no_reestimate` allows.** R1 was priced at 3 days on the assumption that a
scroll state machine had to be built and unit-tested (stack-decision C5: *"the
work that remains is a state machine"*). §5.3 and §5.4 show that assumption is
false: the state machine exists, is correct, and its keyboard driver exists too.
**R1's scroll half is not 3 days of work. The remaining scroll work is one
option, one delegating method, and four key cases.** The wrapping/`kind`/empty-
state/test half is untouched by this finding and keeps its size.

The independently-shippable ~1-hour split named in the problem statement survives
and gets *smaller and more certain*: it is now a single named option change with a
measured before/after.

### 5.8 Ordering inside R1 — the prescribed order still holds, for a new reason

`chat-view.ts:36` **before** `message-row.ts`. Originally justified as "wrapping
bodies before fixing the sticky-bottom off-by-one makes the symptom worse". The
measurement supplies the mechanism: wrapping increases `content.height`, which
increases `maxScrollTop`, which multiplies the one-row over-scroll into a
several-row over-scroll on the first frame. The order is correct. Keep it.

---

## 6. Key architecture decisions

| # | Decision | Choice | Rationale | Alternative rejected |
|---|---|---|---|---|
| A1 | Transport duplication | **Extract `src/server/http-transport.ts` once, in S2's PR, as its own commit** | 4 real differences; 7 test suites touch only the public API → **0 test edits**; deletes `K4` permanently | apply-twice — rejected: leaves a security fix one lapse from silently not shipping, on an immutable signed tarball |
| A2 | Guard allowlist construction | **Built lazily inside `createSession()` from the bound port** | measured: `allowedHosts` matches the full `Host` header incl. port; a port-less allowlist 403s roomyx's own client | static option object — rejected: bricks the product, same class as the `>=1.13.3` floor |
| A3 | Guard placement | **In the extracted handler, before `transport.handleRequest`** — i.e. as SDK constructor options on the transport | version-checked at `>=1.25.0`; effect measured (403 / `-32000`) | hand-rolled header check in roomyx — rejected: duplicates a tested SDK path and would itself need the two-file treatment |
| A4 | R1 scroll state | **None. Use `stickyScroll` unmodified** | measured: suspend and re-engage both work, including via keys | hand-rolled state machine — rejected: a second, worse copy of correct library code |
| A5 | R1 seq-1 fix | **`horizontalScrollbarOptions: { visible: false }` on `chat-view.ts:36`** | bisected root cause; `scrollX:false` and `contentOptions` variants measured ineffective | rewriting the scroll model — rejected: the model is not the defect |
| A6 | Scroll key bindings | **`pageup`/`pagedown`/`home`/`end` → transcript; `up`/`down` stay with the roster** | avoids a fourth unforced published-behaviour change; all four are implemented natively by `ScrollBar.handleKeyPress`. **The criterion naming `PgUp/PgDn/Ctrl-U/Ctrl-D` originated in R11, retired into R1 by the room, and stands under R1 at `improvement-backlog.md:162`. `Home`/`End` replace `Ctrl-U`/`Ctrl-D` because the library implements them and half-page scrolling would need its own delta arithmetic — exactly the hand-rolled scroll math ruling A4 exists to avoid.** Not silent scope loss: an equal-or-larger key set, none of it hand-written | rebinding `up`/`down` — rejected: removes the roster's only interaction path (`NG4`) |
| A7 | Scroll API shape | **`ChatView.handleTranscriptKey(event): boolean`; `scroll` stays private** | preserves §1.2's "TUI never reaches into internals" rule | exposing `scroll` as public readonly — rejected: the rule exists and nothing forces breaking it |
| A8 | Parser unification (R8) | **One `parseFlags` in a new `src/cli/flags.ts`; all three call sites import it** | three copies with three different bare-flag semantics is the defect; `seed.ts` becomes a `cli.ts` subcommand under R3 anyway | keep three, fix each — rejected: R8 exists because they diverged once already |
| A9 | R2 pane state | **Widen `ConnectionStatus` only if the exhaustive record at `status-bar.ts:40` is widened in the same commit** | the record is the load-bearing consumer; `strict` catches it loudly, runtime does not | a second parallel enum — rejected: two state variables for one state is P2 restated |
| A10 | R4 launcher location | **`src/bin/roomyx.js` + `src/bin/roomyx-client.js`, node shebang, `exec`s bun** | `files` ships only `src`. Two distinct properties are at risk: `import.meta.dir` (`cli.ts:47,174`) must still resolve to `src/`, so the launcher hands off to bun rather than running the modules; and **`import.meta.main` (`client/index.ts:132`) must keep evaluating `false` when `cli.ts`'s `roomyx client` subcommand `await import()`s it — a launcher that spawns or re-execs that entry point changes what "main" means and would run `runClient()` twice.** `exec`-ing bun on the real entry path preserves both | a `bin/` top-level dir — rejected: outside the `files` allowlist. Re-exec of `client/index.ts` from the launcher — rejected: breaks `import.meta.main` |

---

## 7. Amendments to the decision registers, with placement

`D_decision_format`: Russian, `## D-NN: <заголовок>` with **Решение / Причина /
Отвергнутая альтернатива**. Two registers both contain a `D-01`; every reference
names its file.

| Amendment | Register file | Lands in | Status |
|---|---|---|---|
| **D-01 amendment** — D-01 constrains the *server*, not the *package*; invariant is one writer per live room | **`docs/roomyx/decisions.md`** | its own commit, **before R3 work begins** | already ruled (G8) |
| **D-06 amendment** — loopback binding does not constrain a browser; remedy is the rebinding guard, not the auth D-06 deferred | **`docs/roomyx/decisions.md`** | **inside S2's commit** | already ruled (G8) |
| **NEW: D-07 — единый HTTP-транспорт для обоих MCP-серверов** (§4) | **`docs/roomyx/decisions.md`** | the extraction commit (commit 1 of S2's PR) | **proposed by this phase — needs owner ratification** |

`docs/roomyx-installer/decisions.md` receives **no amendment**. Its D-01 (init is
explicit, no install-time network) is *cited* by R4's hard criterion and is
already correct as written.

R4's doc change is `README.md:18–19` — prose, not a register entry
(`D_no_build_step_unrecorded`).

---

## 8. Open structural questions this phase did not settle

1. **Does the extraction land as `src/server/http-transport.ts` or
   `src/transport/http.ts`?** Ruled as `src/server/` because
   `mcp-management/server.ts` already imports across that way round would be new;
   `server/` is the older and more depended-upon module. Low stakes, stated so it
   is not re-litigated.
2. **R5's session reaper: idle timeout or `terminateSession()`-only?** The SDK
   exposes `StreamableHTTPClientTransport.terminateSession()`, which fixes
   *roomyx's own* clients (`mcp-client.ts:56`, `registry.ts:229`) but not a
   third-party MCP client that just disconnects. Whether the server also needs a
   time-based reaper is an R5 scope question, not an architecture question.
   **Escalated to the owner (MrCipherSmith) — not left to the PRD.** The PRD
   cannot settle it and handed it back; recording it here as "the PRD's" created a
   round trip with nobody holding the question. It is **coupled to the RSS
   acceptance criterion's `N` and its return-to-baseline tolerance**, which sit
   with the same person: a reaper's idle timeout determines what `N` cycles can
   prove. Rule all three together.
3. **R3/R8 over `seed.ts` (A5).** Unchanged: low confidence, R3 first by build
   order, R8's parser scope settled after R3 lands. A8 above is written to be
   compatible with either outcome.

---

| Key | Value |
|-----|-------|
| Created | 2026-09-09 |
| Agent | gproject-patterns-researcher |
| Phase | 3 |
| Job | gproject-roomyx-backlog |
| Mode | task_in_project |
| Status | final — pending owner approval gate |
