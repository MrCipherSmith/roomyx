# Problem Statement: roomyx defect remediation (`@mrciphersmith/roomyx@0.4.0`)

Job: `gproject-roomyx-backlog` · Phase 1 · mode `task_in_project`
Input: `artifacts/discovery-brief.md` (Phase 0), `docs/roomyx/improvement-backlog.md` (source of truth)

> `metaproject: unavailable` — carried forward from Phase 0.

---

## The one-sentence problem

`roomyx` is shipped, installable, and documented — and in fifteen reproduced
places the documentation describes a program that does not exist. This is not a
gap between what the software does and what users want. It is a gap between what
the software does and **what its own README, walkthrough and decision register
say it does**. Every item is a broken promise the project made in writing.

That framing is the whole project. It sets the success metric (documented
behaviour and shipped behaviour agree), it sets the scope (closed at fifteen, no
features), and it explains why three of the fixes are *removals* of published
surface rather than additions.

### Two readers, not one

Every problem below has to be read twice — once for a human sitting at a
terminal, and once for an **LLM agent driving the CLI or calling the MCP tools**.
The package is designed for the second reader: `docs/roomyx/testing-story.md` is
a walkthrough in which an agent operates this binary, and the management server
exists to expose the installer surface to any MCP client. Several findings are
mild through the first lens and severe through the second. `--help` is how an
agent learns a command it has never seen. An unbounded `get_transcript` is not
20 ms of CPU; it is a context window.

### One adversary, fourteen self-inflicted wounds

Exactly one finding (R5, whose exploitable half ships as S1+S2) has an actor who
is not the operator. Every other item requires the operator to do something to
themselves — run a command, mistype a flag, attach a client. The room recorded
that its own scoring rubric had **no axis able to express that asymmetry**, and
that the one adversarial item therefore sat at two placements until it was
argued in on merits rather than scores. The asymmetry is real, it is carried
here as a property of the problem set, and repairing the instrument that could
not see it is explicitly out of scope (NG2).

---

## Core Problems

### P1: The reading surface does not show the content it exists to show
*Findings: R1 (with R12 below the line; R2 contributes the blank pane)*

A **developer running a startup-room session** cannot read the transcript they
attached a TUI to read, because `ChatView` over-scrolls by one row, clips every
message to a single unwrapped line, drops `kind` and `in_reply_to`, has no key
bound to scrolling, and renders a healthy-but-quiet room, a one-message room and
a nonexistent-log room byte-identically.

**Impact**: high — the only unanimous item on the board (criterion 3: 10/10).
**Documented-vs-shipped divergence**: `testing-story.md:171` promises "if you had
scrolled up to read history, the view does not yank you back down" — a promise
about an action no key performs. The log schema's challenge/answer structure is
"the whole point of the log" and is invisible in the viewer of that log.
**Evidence**: rendered under `@opentui/core`'s headless test renderer against the
published package. Shipped to 0.4.0 because `test/client/render.test.ts` asserts
roster names and the goal statement and never asserts that a message body appears
— "a test suite that certifies the frame and not the picture."

### P2: The system reports a state that is not its state
*Findings: R2 (scheduled), R7 and R9 (below the line)*

A **developer** cannot distinguish a broken server from a broken client, because
the client calls a healthy server *disconnected* (`mcp-client.ts:113` ignores
`result.isError` and parses regardless), the registry simultaneously swears the
room is *live* (liveness is the `initialize` handshake and never opens the log),
`roomyx serve nope.jsonl` prints a URL and mints a room id for a file that does
not exist, a `SIGSTOP`'d healthy server gets **deleted** from the registry on a
500 ms timeout, and `roomyx serve` survives `SIGTERM` for 30+ seconds when a
client is attached — after already having deregistered itself.

**Impact**: high (R2 criterion 3: 9-10/10); the below-line half is real but unscheduled.
**Documented-vs-shipped divergence**: installer D-03 asks liveness to verify
*which room answered*; the code verifies only *that a port answered*.
`test/cli-serve-lifecycle.test.ts` is green because it tests the unattached case;
the attached case is the one the README documents — "a green test certifying the
configuration nobody runs."

### P3: The CLI cannot be learned without side effects, and its output cannot be budgeted
*Findings: R8 (scheduled, absorbing R13/R14); R10 (below the line)*

An **LLM agent** driving this CLI cannot discover what a command does, because
the first thing any agent does with an unknown command is `--help`, and
`roomyx serve --help` **starts a server and mints a room id**. `roomyx --help`
prints usage to stderr and exits 1. Flags are scanned for anywhere and
positionals handed to `rest[0]` blindly, so `roomyx serve --port 0 room.jsonl`
serves a file literally named `--port`; `--port` bare becomes port 1
(`Number(true) === 1`); `--port abc` becomes `NaN` and silently picks an
ephemeral port; `--dryrun` is silently ignored; `rooms list --registry
/nonexistent.json` prints "No live rooms" having read a different file. Three
divergent parser copies exist (`cli.ts:20`, `client/index.ts:12`, `seed.ts:17`).
Separately, `get_transcript` has no `limit`: a cold attach at `since_seq=0`
shipped 3.8 MB in one text block to a consumer that is a language model.

**Impact**: high (criterion 3: 9-10/10). Severity is a function of the second reader.
**Documented-vs-shipped divergence**: the walkthrough asks an agent to drive this
CLI; the CLI has no grammar for one to learn.

### P4: The documented entry point has no documented on-ramp
*Finding: R3 (position zero)*

A **new user** cannot follow `README:36` (`roomyx serve path/to/room.jsonl`)
because nothing anywhere says where that file comes from. The only tool that
creates one is `src/cli/seed.ts` — not in `bin`, zero mentions in the README,
documented only in the walkthrough as
`bun "$(npm root -g)/@mrciphersmith/roomyx/src/cli/seed.ts"`.

**Impact**: high (criterion 3: 10/10), but **not a build dependency**. Stated
precisely by the room: `ChatView` was unit-tested against fixtures with no room
log in existence. What R3 blocks is *every human evaluation of the other four*,
and every new user.
**Documented-vs-shipped divergence**: "reaching into a global node_modules path
to use a tool's own file is the sound of a package that hasn't decided that file
is a feature."
**Gate**: this problem cannot be closed by an implementer alone — see P8.

### P5: The package cannot speak at the moment it fails
*Finding: R4*

A **developer on a Node-only machine** gets `/usr/bin/env: 'bun': No such file or
directory` and zero bytes of diagnostic from roomyx, because `bin` points at
`.ts` files behind a `#!/usr/bin/env bun` shebang and a shebang is an `execve`
dispatch handled by the kernel — there is no slot in it for a message. The same
cause leaves npm's generated Windows `.cmd` shim with nothing to work with.

**Impact**: medium-high (criterion 3: 8-10/10), and **carrying a recorded dissent**:
R4 is the only one of the five whose failure mode is *documented* — `README:18`
says in bold that Bun must be on PATH. P1, P2 and P3 all bite the person who did
everything right. That is a real difference in class and the dissent stays on the record.
**Documented-vs-shipped divergence**: `engines.bun` reads as a constraint and
enforces nothing — a package declaring `engines.bun >=99.0.0` installs under
`npm install --engine-strict` with exit 0. "A comment that looks like a
constraint, which is worse than no constraint." The "no build step" stance that
appeared to block a fix is README prose, not a recorded decision (grepped across
both registers) — so no carve-out is needed.

### P6: An unauthenticated loopback port is reachable from a web page, and writes files
*Findings: S1 + S2 (ship now); R5 (ranked fifth, argued in on merits)*

An **operator whose only contribution is having a browser open** can have an
arbitrary file written to their disk and their entire private room transcript
read, because `roomyx.skills.sync` accepts a caller-supplied `targetPath` on an
unauthenticated loopback port with no `Origin`/`Host` validation on either
transport. Demonstrated: a cross-origin request wrote a file of the attacker's
choosing, directory auto-created. 400 `initialize` POSTs carrying
`Origin: https://evil.example` all completed the handshake. After a rebind the
page is same-origin and `room.get_transcript` at `since_seq=0` hands over
everything — **exfiltration first, exhaustion second**.

**Impact**: highest consequence, lowest frequency — the case the rubric could not score.
**Also a defect with no attacker in it**: `onsessionclosed` never fires because
the SDK client's `close()` only aborts locally; ~102 KB retained per request,
never reclaimed. 200 *legitimate* connect/close cycles cost +18 MB.
**Documented-vs-shipped divergence**: D-06's threat model enumerated process
actors and never enumerated browsers, so the register currently tells the next
reader that loopback binding excludes a browser. It does not.
**The guard is a constructor option, and the risk is which version answers it**:
verified against installed `@modelcontextprotocol/sdk@1.30.0`,
`StreamableHTTPServerTransport`'s constructor forwards its whole options object
into `WebStandardStreamableHTTPServerTransport` (`streamableHttp.js:52`), and
`StreamableHTTPServerTransportOptions` is a direct alias of the web-standard
options type (`streamableHttp.d.ts:20`). `enableDnsRebindingProtection` /
`allowedHosts` / `allowedOrigins` are read and enforced at
`webStandardStreamableHttp.js:77-79,141-160`, answering 403 / `-32000`. So the
option **does** reach the transport roomyx constructs; a grep of
`streamableHttp.js` finds nothing only because the wrapper forwards without
naming. The live hazard is the **dependency floor** — see risk A6.
**Duplication note**: `src/server/serve.ts` and `src/mcp-management/server.ts` are
~90% duplicated, so any transport-level change lands in both files, or the shared
shape is extracted first.

### P7: Operations the project treats as safe are not safe
*Findings: S3, S4*

A **developer running `roomyx init` a second time** loses hand-edits to the
staged `startup-room/SKILL.md` with no warning, no backup and no hash record —
while the same function guards `config.json` and `registry.json` with `existsSync`
four lines earlier, and `syncSkill` already implements exactly the needed
behaviour. Separately, the release workflow installs with bare `bun install`
while CI uses `--frozen-lockfile`, so the release job can resolve a version CI
never tested and ship it **with provenance attached**.

**Impact**: medium; cost of repair is minutes-to-an-afternoon each.
**Documented-vs-shipped divergence**: backup-before-write plus `lastSyncedHashes`
is the project's stated skill-sync safety contract (`README:183-196`); `init.ts:44`
opts out of it silently. Provenance attests to an artifact whose dependency set
was never the tested one.

### P8: The reasoning that licenses the code lives in a transcript, not in the register
*Cross-cutting: the D-01 and D-06 amendments; the release smoke test; the missing CHANGELOG*

The **next reader of `docs/roomyx/decisions.md`** — a future maintainer, or the
same human in three months — will be misled, because D-01 currently reads as
constraining the package when it constrains the server, and D-06 currently reads
as though loopback binding excludes a browser. Both corrections exist only inside
a room transcript. "An argued exception that lives in a room transcript isn't an
argued exception, it's a rumour."

This is why P4 and P6 carry a **procedural gate that no organisation will
enforce**: the owner and the implementer are the same person (`MrCipherSmith`,
sole npm scope holder, 22 of 23 commits), so the gate exists only if the
definition-of-done enforces it.

**Two adjacent instances of the same shape**, surfaced while planning and never
scored by the room:
- The release smoke test runs `roomyx --help > /dev/null 2>&1 || true` — output
  discarded, exit code discarded. `roomyx --help` exits 1 today (half of P3) and
  this step has passed every release. **A green light wired to nothing.**
- S1 is required to have "its own changelog line" and **no `CHANGELOG.md` exists**;
  release notes are generated from commit titles.

### P9: Fixing this changes a surface users already depend on
*Findings: S1, R8, R4 — a compatibility event, not a free change*

Anyone who **installed 0.4.0 and read the README** may have built on behaviour
the remediation removes: `roomyx.skills.sync` loses its documented `targetPath`
input (`README:168`); `serve`'s default port changes from the documented `4319`
(`README:82`) to `0`; both `bin` entries change shape. R8 additionally makes
previously-silent inputs (`--dryrun`, bare trailing flags, `--port abc`) fail
loudly, which is a behaviour change for anyone who scripted around them.

**Impact**: unknown magnitude — **the single lowest-confidence fact in the input**.
No download data was available offline. Whether this needs a deprecation cycle or
a minor bump plus README notes depends on it.
**Secondary victim, named**: MCP client authors embedding `serveManagement` from
`src/mcp-management/server.ts` are the one group for whom S1's removal is a
breaking API change rather than a security fix.

---

## Goals

Every goal is a **documented-vs-shipped agreement** statement. Each is verified
either by a test that fails before the fix, or by a diff in a documentation file.

### G1: The viewer shows what the log contains, and a test proves it
**Statement**: The transcript pane renders every message from seq 1, wrapped to
pane width, with `kind` and a reply marker, with distinct empty and error states,
and with keys that scroll it.
**Success Metric**: (a) a test **fails** when seq 1 is not drawn — not a test
asserting it is drawn, a test that fails; (b) `testing-story.md:171`'s
sticky-bottom promise is exercisable by a key that exists.
**Target**: 0 documented reading-surface claims that cannot be demonstrated.
**Measured by**: `bun test` on the R1 branch, reverting the fix and confirming red.
**Available primitives**: `@opentui/core@0.5.11` already ships `wrapMode` /
`truncate` and `scrollBy` / `scrollTop` / `stickyScroll` setters — neither the
wrapping nor the scroll math needs hand-rolling.
**Covers**: P1.

### G2: Reported state equals actual state
**Statement**: A healthy server is never called disconnected; a server that
cannot open its log never registers; error responses are surfaced as errors with
the file named.
**Success Metric**: serving a nonexistent path fails before binding, with a
message naming the file; no code path can produce *live* and *disconnected*
simultaneously.
**Target**: R2's reproduction (serve a nonexistent path → blank room, the word
"disconnected", reconnect loop) no longer reproduces.
**Measured by**: the R2 reproduction re-run; `log/store.ts:58`'s bare `JSON.parse`
no longer throws an unnamed `SyntaxError`.
**Covers**: P2 (scheduled half). *Ride-along scope note in NG1.*

### G3: The CLI has one grammar, and learning it costs nothing
**Statement**: One parser, one flag contract; `--help` on any command prints help,
performs no side effect, and exits 0; unknown flags and unparseable values are
rejected loudly; every command honours the flags it accepts.
**Success Metric**: all six lines of R8's measured reproduction block behave as
documented; `roomyx serve --help` starts no server and mints no room id;
`roomyx --help; echo $?` prints to stdout and exits 0.
**Target**: 6/6 reproductions fixed; port defaults split by kind (`serve` → `0`,
`mcp` stays `4320`) **with the README note that change requires**.
**Measured by**: the reproduction block re-run against a packed tarball.
**Covers**: P3 (scheduled half).

### G4: A supported command creates the file the README tells you to serve
**Statement**: `roomyx room new` and `roomyx room append` exist in `bin`, are in
the README, and the live-room refusal is **implemented, not just documented**.
**Success Metric**: a new user can go from `npm install -g` to a served room
using only README commands, with no `npm root -g` path in sight.
**Target**: zero walkthrough steps requiring a reach into global `node_modules`.
**Measured by**: a clean-machine run of the README's own instructions.
**Gate**: not startable until G8's D-01 amendment is in the file.
**Covers**: P4.

### G5: The package speaks when it fails
**Statement**: On a machine without Bun, `roomyx` and `roomyx-client` print a
diagnostic naming the missing runtime and an install URL, and exit 1.
**Success Metric**: stderr is non-empty and mentions Bun; exit code is 1;
**zero network calls are made**.
**Target**: hard negative criterion — the launcher must never fetch, install or
bootstrap Bun (installer D-01 exists to refuse install-time network fetches).
Nothing is transpiled; shipped TypeScript stays the source of truth.
**Measured by**: run under a PATH without `bun`, with network egress observed.
**Covers**: P5.

### G6: The loopback surface has no arbitrary-path writer and no cross-origin door
**Statement**: The network `roomyx.skills.sync` tool accepts no caller-supplied
target path; both transports validate `Origin` and `Host` before dispatch;
sessions are reclaimed.
**Success Metric**: (a) the cross-origin arbitrary-write reproduction returns a
rejection instead of a written file; (b) `Origin: https://evil.example` fails the
handshake; (c) RSS returns to baseline after N legitimate connect/close cycles;
(d) an unknown `mcp-session-id` gets a 404 rather than an orphan transport;
(e) **the declared `@modelcontextprotocol/sdk` floor is raised to a version that
actually enforces the option**, and the test asserts the guard's *effect* (a 403 /
`-32000`) rather than its presence in a config object.
**Target**: all five; the CLI keeps its literal-path escape hatch, the network
tool does not. Applied in both `src/server/serve.ts` and
`src/mcp-management/server.ts`, which are ~90% duplicated.
**Measured by**: re-running the room's own 400-POST and file-write reproductions.
**Covers**: P6.

### G7: Safe-by-pattern operations actually follow the pattern
**Statement**: `init.ts:44` routes through `syncSkill` (backup, hash record,
warnings surfaced) exactly as lines 40 already do; the release workflow installs
with the same frozen lockfile CI uses.
**Success Metric**: a hand-edited `startup-room/SKILL.md` survives a second
`roomyx init`, or is backed up with a warning the user sees; `release.yml` and
`ci.yml` resolve identical dependency trees.
**Target**: 0 divergence between CI install and release install.
**Measured by**: the S3 reproduction re-run; diff of the two workflow install steps.
**Covers**: P7.

### G8: The register says what the code does, in the commit that changes the code
**Statement**: The **D-01 amendment is written into `docs/roomyx/decisions.md`
first**, before R3 work begins; the **D-06 amendment lands inside S2's commit**,
not R5's.
**Success Metric**: both amendments present, in the register's established
`D-NN` / *решение / причина / отвергнутая альтернатива* shape and language
register; each qualified as to *which* D-01 (`docs/roomyx/` vs
`docs/roomyx-installer/` — both exist and mean different things).
**Target**: 2/2. This is a **binary definition-of-done item**, not a soft one:
if the guard ships and the amendment does not, the code ships and the reasoning
never does, and the next reader of D-06 still believes loopback binding excludes
a browser.
**Measured by**: file diff, reviewed by the owner as owner rather than as implementer.
**Covers**: P8.

### G9: The compatibility event announces itself
**Statement**: The three published-surface changes (S1's `targetPath` removal,
R8's `serve` default, R4's `bin` shape) carry a version decision, the README
edits they invalidate, and release notes a user can find.
**Success Metric**: `README:82` (port `4319`), `README:168` (`targetPath`) and
`README:18` (Bun on PATH) are all consistent with shipped behaviour at tag time;
S1 has its own commit and its own changelog line, wherever the project decides
that line lives.
**Target**: 0 README statements contradicted by the release they ship in.
**Measured by**: README-vs-behaviour audit as a release gate.
**Covers**: P9, and the missing-CHANGELOG half of P8.

---

## Non-Goals

### NG1: The four below-the-line findings are not scheduled — R7, R9, R10, R12
**Why excluded**: the room reproduced them, scored them, and recorded them as
*real and not scheduled*. A plan that quietly promotes them contradicts its input.
**One precise carve-out, and only one**: R2's own entry instructs that
`shutdown()` at `cli.ts:85-91` deregisters *before* closing — six lines from the
code R2 touches — and says "fix it while you're there." **That ordering fix rides
along in R2's diff. R9's other half — `httpServer.close()` draining an attached
SSE stream so `serve` survives SIGTERM for 30 s — remains unscheduled.** No other
below-line item rides anywhere. R12 is noted as *should inherit R1's wrap
primitive if and when it is ever scheduled* — a constraint on a future item, not
a schedule for it, and one `@opentui/core@0.5.11`'s own `wrapMode`/`truncate`
already satisfies for whoever gets there.

### NG2: Repairing the room's scoring rubric is out of scope
**Why excluded**: the room diagnosed its own instrument — five of six criteria
measure whether an item is *well-formed*, only criterion 3 measures whether it is
*worth doing*; it scores frequency and treats it as consequence; it has no axis
for attacker-reachability. It filed that as "worth fixing before the next room,
**not mid-flight**." This project consumes the rubric's output; it does not repair
the rubric.

### NG3: No new findings, no re-derivation, no re-estimation
**Why excluded**: all fifteen were reproduced against the published package and
argued over by five participants, including two documented upward re-pricings
(R1 2.5→3 days when R11 merged in; R8 when R13 merged in) and one *downward*
re-price that cost its own advocate a slot. Scope is closed at fifteen. Sizes are
carried verbatim. Downstream phases plan them; they do not re-price them.

### NG4: No features
**Why excluded**: not one of the fifteen is a feature request, and the project's
identity depends on that staying true. Where a finding's fix implies new surface
(R3's `room new|append`), it exists to make a *documented* claim true, not to add
capability. R7's proposed `room.health` tool is below the line and therefore not
in scope at all.

### NG5: No build step, no transpiler, no `dist/`
**Why excluded**: shipped TypeScript stays the source of truth. R4's launcher is
hand-written and node-shebanged. The hard negative criterion stands: **the
launcher must never fetch, install or bootstrap Bun** — "we made the error
message nicer by downloading a runtime" would be the single worst trade available.

### NG6: No 1.0, no deprecation machinery, no migration tooling
**Why excluded**: this is a 0.x package with five tags and an unknown, assumed-small
install base. The compatibility event (G9) is discharged by a version decision,
README edits and release notes — not by shims, aliases or a deprecation cycle.
**Flagged**: this rests on the medium-confidence install-base assumption (A2 below).

### NG7: No new release channel
**Why excluded**: `workflow_dispatch` is deliberately absent from `release.yml`.
Every fix reaches a user only via a `v*` tag matching `package.json`. Remediation
does not change how the project ships, only what it ships.

### NG8: The `testing-story.md` step-9 second-refusal code change is not in scope
**Why excluded**: the overclaim is **already fixed** — the walkthrough now states
what the code does. Making the second refusal genuinely separate (`skill-sync.ts:78`
is a single `targetHasIndependentChanges && !options.yes` gate, so one `--yes`
clears both refusal reasons) would be a code change and is therefore a *future*
item, not one of the fifteen.

### NG9: Parallelisation across people
**Why excluded**: team of one, no budget, no deadline, no second implementer
named anywhere in the inputs. Parallelisation across independent PRs is available;
parallelisation across humans is not.

---

## Target Users

### Primary persona A — the human at a terminal
- **Who**: a solo or small-team developer running `startup-room` multi-persona
  sessions; installs globally, runs `roomyx serve`, attaches `roomyx-client` in a
  second terminal.
- **Core need**: to read the room and to trust what the tool tells them about it.
- **Current solution**: they hit P4 first (no supported way to create the log the
  README tells them to serve), then P1 (a blank or clipped pane), then P2 (a
  healthy server reported disconnected), and on a Node-only machine, P5 (a bare
  `execve` failure with no roomyx bytes in it).
- **Hit by**: P1, P2, P4, P5, P7.

### Primary persona B — the LLM agent driving the CLI or MCP tools
- **Who**: a language model operating `roomyx` as a tool. Not a hypothetical:
  `docs/roomyx/testing-story.md` *is* a walkthrough of an agent doing this, and
  the management server exists to expose the installer surface to MCP clients.
- **Core need**: to discover a command's contract without executing a side effect,
  and to receive output sized for a context window.
- **Current solution**: it types `--help` and starts a server. It reads a 3.8 MB
  transcript in one block.
- **Hit by**: P3 (severely — this persona is the reason P3 is severe at all),
  P2 (illegible failure modes are worse for a non-human reader), P6.

### Owner / approver — `MrCipherSmith`
- **Who**: sole npm scope holder, author of 22 of 23 commits, the only person who
  can amend `docs/roomyx/decisions.md`. Releases are OIDC-bound to the
  `MrCipherSmith/roomyx` workflow identity, so nobody else can ship a fix either.
- **Core need**: the two amendments (G8) recorded before / inside the commits they
  license.
- **Structural risk**: owner == implementer, so **the ratification gate is
  procedural and nothing organisational enforces it**. It exists only if the
  plan's definition-of-done makes it a blocking artifact.

### Secondary — MCP client authors embedding `serveManagement`
- The one group for whom S1's `targetPath` removal is a **breaking API change**
  rather than a security fix. Named explicitly so the compatibility decision (G9)
  is made with them in view.

### Downstream — the next reader of `docs/roomyx/decisions.md`
- Two of the gates exist purely to serve this reader. Includes the same human, in
  three months.

### Adversary — a web page in a browser the operator happens to have open
- Present in exactly one finding (P6). No credentials, no local access, no
  operator error required beyond having a browser running.

---

## Success Criteria

| Metric | Current State | Target | Measurement Method |
|---|---|---|---|
| Documented claims contradicted by shipped behaviour | 15 reproduced | 0 among the 10 scheduled items | Re-run each finding's recorded reproduction against a packed tarball |
| Reading-surface: test that **fails** when seq 1 is not drawn | does not exist | exists and is red before the fix | `bun test` with the fix reverted |
| R8 reproduction block (6 measured lines) | 6/6 misbehave | 6/6 behave as documented | Re-run against `./.release/prefix/bin/roomyx` |
| `--help` side effects | `serve --help` starts a server, mints a room id | none; exit 0; stdout | Process/registry inspection after `--help` |
| Cross-origin arbitrary file write | reproduced (file written, dir auto-created) | rejected | Room's own reproduction |
| Cross-origin `initialize` handshakes accepted | 400/400 | 0/400 | Room's own 400-POST reproduction |
| Declared SDK floor able to no-op the guard | `^1.0.0` (resolves 1.30.0) | floor raised to a version that enforces `enableDnsRebindingProtection`; guard's **effect** asserted, not its config | `package.json` diff + a test expecting 403 / `-32000` |
| Transport fix applied to both duplicated servers | n/a | 2/2 (`serve.ts`, `mcp-management/server.ts`), or the shape extracted once | Diff review |
| RSS after N legitimate connect/close cycles | +18 MB per 200 cycles, never reclaimed | returns to baseline | Same harness |
| Unknown `mcp-session-id` | mints an orphan transport | 404 | Request replay |
| Diagnostic bytes emitted by roomyx on a Bun-less machine | 0 | non-empty stderr, exit 1, **0 network calls** | PATH without `bun`, egress observed |
| Decision amendments recorded | 0/2 | 2/2, each in its prescribed commit | File diff; D-01 before R3 starts, D-06 inside S2's commit |
| Divergence between CI install and release install | present (`--frozen-lockfile` vs bare) | none | Workflow diff |
| README statements invalidated by the release they ship in | 3 pending (`:18`, `:82`, `:168`) | 0 at tag time | README-vs-behaviour audit as a release gate |
| Release smoke test able to fail | no (`>/dev/null 2>&1 \|\| true`) | yes — decision required, see Q5 | Deliberately break `--help`, confirm red |
| Below-the-line items promoted into scope | n/a | 0 (excepting NG1's single named ride-along) | Scope diff against the backlog's four tiers |
| New findings introduced | n/a | 0 | Scope diff |

---

## Assumptions & Risks

| # | Assumption | Risk if wrong | Mitigation |
|---|---|---|---|
| A1 | Owner and implementer are the same person, so the D-01/D-06 gate is procedural rather than a hand-off | The gate is skipped under time pressure; the code ships and the reasoning does not; P8 recurs verbatim | Make both amendments **blocking definition-of-done artifacts** with named commits, not tasks in a list. Confidence: **high** on the fact, **the consequence is the risk** |
| A2 | The installed user base is small and not individually reachable | The three surface changes (G9) break real consumers with no warning; provenance-signed releases make it worse, not better | Treat the version/announcement decision as an explicit owner decision, not a default. Confidence: **medium** — no download data was available offline. **This is the lowest-confidence input in the brief and it drives Q2** |
| A3 | All ten scheduled items can land inside a single `0.5.0` | Release structure has to be redone mid-flight | Confidence: **low** — flagged by Phase 0 as a plan decision, not a discovered fact. Deferred to Phase 6, must not be assumed by Phase 4 |
| A4 | Derived schedule (~9 working days for the ten scheduled items) is arithmetic over the room's own sizes | Read as a commitment | Carry as arithmetic, never as a date. "Afternoon" ≈ half a day is a unit conversion, **not** a re-estimate. Confidence: **medium** |
| A5 | R3 and R8 collide over `src/cli/seed.ts` and neither item says so | Whichever ships second inherits work the other made pointless | Recorded as a known coupling: R3 goes first by build order, so R8's parser scope should be settled **after** R3 lands, not planned against three files that may be two. Confidence: **low/undetermined** — Phase 0 Q6 |
| A6 | **The SDK version that answers `enableDnsRebindingProtection` is the one installed.** `package.json` declares `@modelcontextprotocol/sdk: ^1.0.0` and resolves 1.30.0. The option-forwarding wrapper shape is recent | A consumer installing today satisfies `^1.0.0` with an older 1.x that predates the forwarding. The guard is **set and silently does nothing**. A security fix that no-ops on some installs is worse than one never attempted, because it stops anyone looking | **Raising the dependency floor is part of S2's definition of done**, not a footnote: pin a minimum `@modelcontextprotocol/sdk` at or above the first version that forwards the options, and assert the guard's effect in a test rather than its configuration. Confidence: **high** (constructor forwarding and enforcement both verified against installed 1.30.0) |
| A7 | `bun audit` in CI remains the only supply-chain gate. **No dependency is added**, but S2 raises the declared floor of an existing one (A6), and S4 removes the CI/release install divergence | Low risk on its own; interacts with S4 — a raised floor is only meaningful if the release job installs the same tree CI tested | Confidence: **high** |

### Low-confidence areas, flagged rather than papered over
Per the phase's fifth iron law, three inputs are **not settled** and must not be
treated as settled by any downstream phase: **release packaging strategy** (A3),
**whether the owner ratifies the drafted amendments as written** (Q1), and
**whether R3 and R8 collide over `seed.ts`** (A5). None of them block problem
definition. All three shape planning.

---

## Scope Boundary

**In scope** — the ten scheduled items and their documentation consequences:
- Ship now: **S1**, **S2** (same PR — same attack path; S1 keeps its own commit
  so it cannot be reverted as collateral), **S3**, **S4** (in another PR's
  description, not its own).
- Position zero: **R3**, gated on the D-01 amendment being written first.
- The five: **R1** (must not merge without R2), **R2** (carrying R9's
  deregister-order ride-along), **R8**, **R4**, **R5** (reaper + amendment, the
  guard having shipped as S2).
- The two decision amendments, each in its prescribed commit.
- The README/CHANGELOG/version consequences of the compatibility event.

**Out of scope** — see NG1–NG9:
R7, R9's drain half, R10, R12; rubric repair; new findings; re-estimation;
features; a build step; a 1.0 or deprecation machinery; a new release channel;
the step-9 second-refusal code change; multi-person parallelisation.

**Undecided, deferred to planning** (not resolved here, and not to be silently
resolved elsewhere): the version/announcement shape of the compatibility event;
whether the release smoke test may be strengthened alongside R8; where S1's
changelog line lives given no `CHANGELOG.md` exists; how R3/R8 divide `seed.ts`.

### Ordering properties that must survive into planning
Stated here because losing them changes what the problem *is*, not just how it is
scheduled:
- **Ranked order is not build order, and both are given.** Build:
  ship-now → R3 → R4 → R8 → R2 → R1. Ranked by weight: R1, R2, R8, R4, R5. R5 is
  in the ranking and not the build order; R3 is in the build order and not the
  ranking. Both facts are deliberate. The named failure mode: an implementer
  reading the ranked five as a work queue starts with a three-day render rewrite
  for rooms they have no supported way to create.
- **Sequencing is prescribed, not derivable**: R1 must not merge without R2;
  S1+S2 same PR; S1 its own commit; R9's ordering fix rides with R2; R1 starts at
  `chat-view.ts:36` (the scroll model), **not** at `message-row.ts`'s `height: 1`
  — wrapping bodies before fixing the sticky-bottom off-by-one makes the symptom
  worse — and the failing test comes before either.
- **R1 splits**: the `chat-view.ts:36` fix is ~1 hour and independently shippable.
  Handed over as one unit, the hour that makes every room's first message exist
  waits on the three days.
