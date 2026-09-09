# roomyx improvement backlog

Produced by a `startup-room` session on 2026-09-09 against published
`@mrciphersmith/roomyx@0.4.0`. Five participants — devtools, developer
experience, security, backend architecture, terminal UI — read the source, ran
the binaries, and scored fifteen deduped candidates. Full transcript:
`brainstorm/roomyx-improvements-room.md`.

**Every finding here was reproduced against the published package.** Not one is
a feature request; all fifteen are places where shipped code behaves
differently from what the docs promise.

## How to read the ordering

**The five are ranked by weight, not by build order.** The room insisted this
be stated, because an implementer reading a ranked list as a work queue would
start with a three-day render rewrite for rooms they have no supported way to
create.

- **Build order:** ship-now items → R3 → R4 → R8 → R2 → R1.
- **Ranked by weight:** R1, R2, R8, R4, R5.

Each item carries its **criterion-3 score** ("does someone actually hit this,
and can you name who and when") next to its total, because that is the only
criterion that separated anything.

### A finding about the scoring itself

Every one of the fifteen items cleared the 40/60 threshold. The room recorded
that as a defect in its own instrument rather than a result:

> Five of the six criteria — concrete, grounded, honest effort, consistent with
> the project's decisions, not-already-done — measure whether an item is
> *well-formed*. Only criterion 3 measures whether it is *worth doing*. So a
> perfectly-specified triviality beats a roughly-specified emergency. We built a
> type checker and called it a value function. — Théo

The gap has a shape: the rubric scores **frequency** and treats it as
**consequence**, and has no axis for *attacker-reachability* — which is why the
one item with an adversary sat at two placements until it was argued in on
merits rather than scores. Worth fixing before the next room, not mid-flight.

---

## Ship now — outside the ranked five, ahead of it

These need a commit, not a slot. Three participants independently concluded
that an item whose whole cost is under an afternoon should never occupy a place
on a prioritisation list.

| | What | Why now | Size |
|---|---|---|---|
| **S1** | Drop `targetPath` from the `roomyx.skills.sync` MCP tool | A live arbitrary-path file writer on an unauthenticated loopback port. Demonstrated: a cross-origin request wrote a file of the attacker's choosing, directory auto-created. The CLI keeps its literal-path escape hatch; the network tool must not have one. | minutes |
| **S2** | Origin / Host validation on both transports | The door S1's payload sits behind. **Not three constructor options — see the correction below.** Ship in the same PR as S1: same attack path. **The D-06 amendment goes in this commit**, not in R5's. | an afternoon |
| **S3** | Route `init.ts:44` through `syncSkill` | `roomyx init` overwrites the staged `startup-room/SKILL.md` unconditionally — reproduced: a hand-edit vanished with no warning, no backup, no hash record. The same function guards `config.json` and `registry.json` with `existsSync` four lines earlier. `syncSkill` already does exactly what's needed; this is a call-site swap plus surfacing `result.warnings`. | an afternoon |
| **S4** | `release.yml` uses bare `bun install`; CI uses `--frozen-lockfile` | The release job can resolve a version CI never tested and ship it with provenance attached. Goes in another PR's description, not its own. | one word |

**S1 gets its own commit and its own changelog line** — deliberately not folded
into someone else's PR, so it cannot be reverted as collateral.

### Corrections to S2, filed after the room closed

**The room was right and an intermediate correction was wrong — the guard *is* a
constructor option.** A grep of `server/streamableHttp.js` for
`enableDnsRebindingProtection` returns nothing, and that was briefly written up
here as "the SDK doesn't ship the guard on this transport." The grep was
accurate and the conclusion was not. At `@modelcontextprotocol/sdk@1.30.0`,
`StreamableHTTPServerTransport` is a thin wrapper —
`streamableHttp.js:52` does `new WebStandardStreamableHTTPServerTransport(options)`,
and `StreamableHTTPServerTransportOptions` is a direct type alias for that
transport's options. The options are forwarded, not named, which is why the
string never appears. The guard itself lives at
`webStandardStreamableHttp.js:141-160` and answers 403 / `-32000`.

**So S2 is the three constructor options after all** — on both transports.

**But the dependency floor has to move with it.** `package.json` declares
`@modelcontextprotocol/sdk: ^1.0.0` and resolves 1.30.0. The wrapper shape is
recent; an older 1.x satisfying that range may not forward these options at all,
in which case a consumer installing today gets a version where S2 silently does
nothing. Raising the floor to the version that introduced the forwarding is part
of S2, not an afterthought.

**Both transports, twice.** `src/server/serve.ts` and
`src/mcp-management/server.ts` are ~90% duplicated, so every transport fix lands
in both files — or the shared shape gets extracted first.

**Attach the D-06 amendment to this commit, not to R5.** The room split R5 so
its exploitable half could ship immediately — which opens a seam: if the guard
lands here this week and the amendment stays bound to the residual R5, the code
ships and the reasoning never does, and the next reader of D-06 still believes
loopback binding excludes a browser.

> The rumour problem doesn't get better because the fix shipped faster. — Priya

## Position zero — gated on the owner, not on an implementer

**R3 — `roomyx room new|append`.** *Criterion 3: 10/10. Score 52-56. Half a day
plus a half-hour decision edit.*

`README:36` says `roomyx serve path/to/room.jsonl`. Nothing anywhere says where
that file comes from. The only tool that makes one is `src/cli/seed.ts` — not in
`bin`, zero mentions in the README, documented only in the walkthrough as
`bun "$(npm root -g)/@mrciphersmith/roomyx/src/cli/seed.ts"`.

> Reaching into a global node_modules path to use a tool's own file is the sound
> of a package that hasn't decided that file is a feature. — Marcus

**It is outside the ranked five for one reason, and it isn't value.** R3 needs a
recorded decision amended, and amending a decision is the owner's act, not an
implementer's. It is a ratification gate the other four don't have.

**Blocking-ness, stated precisely:** R3 is not a build dependency — `ChatView`
was unit-tested against fixtures without any room log existing. What it blocks
is *every human evaluation of the other four*, and every new user.

**Definition of done:**
1. The D-01 amendment is written into `docs/roomyx/decisions.md` **first**, in
   substantially these terms: *D-01 constrains the server, not the package; the
   invariant is one writer per live room. `room new` creates a log with no
   dispatcher (writers 0→1, no race). `room append` refuses when
   `listLiveRooms()` shows a live room serving that path; `--force` overrides.*
2. Then `roomyx room new <path> --goal --roster` and `roomyx room append`, with
   the live-room refusal implemented, not just documented.

> The amendment writes itself from the split we converged on. If that paragraph
> isn't in `decisions.md` when the work lands, the work isn't done. — Théo

---

## The five, ranked by weight

### 1. R1 — the reading surface does not show the content

*Criterion 3: 10/10 — the only unanimous item on the board. Score 57-58.
**~3 days** (re-priced up from 2.5 when R11 merged in).*

**Must not merge without R2.** Written on the item deliberately: shipping R1
alone means Zara's unreadable-log room still renders a blank pane, except now
the pane looks polished — a wrong answer upgraded to a *credible* wrong answer.

Found by rendering `ChatView` under `@opentui/core`'s headless test renderer
against the published package:

- **The first message of every room is never drawn.** One message → empty pane.
  Twelve → you see 2 through 12. A one-row over-scroll from
  `stickyScroll: true, stickyStart: "bottom"` at `chat-view.ts:36`.

  > **Correction, recorded after implementation (2026-09-09).** The defect is
  > real and the diagnosis was right, but "every room, never" is wrong, and
  > that phrasing is what put this item in position one unanimously.
  >
  > Measured four arrival patterns against the pre-fix build. Only one loses
  > seq 1: **≥2 messages appended before the pane's first layout pass.** Render
  > once first — even an empty pane — and seq 1 survives, at any message count.
  > So does appending one message at a time.
  >
  > The real client always renders a `[connecting…]` frame before its first
  > poll returns, so **it never hits the trigger.** Confirmed end-to-end: the
  > pre-fix client, against a real `roomyx serve` and a real two-message log,
  > draws seq 1. The room found this through the headless test renderer, which
  > constructs `ChatView` and appends before rendering — the one pattern that
  > reproduces it.
  >
  > It was still worth fixing: it is one line, and it is a trap laid for
  > whoever later makes the client paint after its first batch instead of
  > before. But no user of 0.4.0 lost a message to it, and the item's ranking
  > rested on the claim that they did. The scoring gate checked the finding's
  > reproduction, not the generality of the sentence written above it.
- **Every message is one hard-clipped line.** `message-row.ts` hardcodes
  `height: 1`. No wrap, no ellipsis, no sign anything was cut. `kind` and
  `in_reply_to` are dropped entirely — the challenge/answer structure that is the
  whole point of the log schema is invisible in the viewer of that log.
- **Three different conditions render byte-identically:** a healthy room where
  nobody has spoken, a one-message room, and a room whose log path doesn't
  exist. `ChatView` has no empty state and no error state.
- **No key scrolls the transcript.** `index.ts:120-121` binds ↑/↓ to the roster.
  `testing-story.md:171` promises "if you had scrolled up to read history, the
  view does not yank you back down" — a promise about an action no key performs.
- The scrollbar thumb is drawn permanently, including on empty panes, so it can
  never signal "there is content above you."

**Acceptance criteria:**
- ↑/↓ move the roster; PgUp/PgDn/Ctrl-U/Ctrl-D scroll the transcript; scrolling
  up suspends sticky-bottom, returning to the bottom resumes it. *(One scroll
  model — the seq-1 off-by-one and the suspend-while-scrolled-up behaviour are
  the same boolean in the same object.)*
- Message bodies wrap to the pane width; `kind` and a reply marker are shown.
- **A test fails when seq 1 is not drawn.** Not "seq 1 is drawn" — a test that
  fails. This shipped to a published 0.4.0 for exactly one reason:
  `test/client/render.test.ts` asserts roster names and the goal statement and
  never once asserts that a message body appears.

> A test suite that certifies the frame and not the picture. — Théo

**Split before handoff:** the `chat-view.ts:36` fix is roughly an hour and is
independently shippable. Handed over as one unit, the hour that makes every
room's first message exist waits on the three days.

**Order of work, from the person who found it:**

> The temptation will be to fix `height: 1` in `message-row.ts` first, because
> it's nine lines and it's obviously wrong. Don't start there. Start at
> `chat-view.ts:36` — the scroll model is where both halves live, and wrapping
> the bodies before the sticky-bottom off-by-one is fixed makes the symptom
> *worse*, not better: taller rows, fewer per screen, and seq 1 still gone. Fix
> the state machine, then the row. And write the failing test before either.
> — Zara

### 2. R2 — the client calls a healthy server "disconnected"

*Criterion 3: 9-10/10. Score 58-59. **~1.5 hours + half a day** for the pane state.*

`mcp-client.ts:113` ignores `result.isError` and `JSON.parse`s the response text
regardless. Serve a path that doesn't exist and: `rooms list` confirms the room
live, `get_state` returns an `isError` ENOENT, the parse throws, the catch fires,
`handleDisconnect()` runs. The user gets a blank room, the word *disconnected*,
and a reconnect loop against a perfectly healthy server — while the registry
still swears it's live, because liveness is the `initialize` handshake and never
opens the log.

Second half: `runServe` must `loadRoomLog()` once **before** binding. Today
`roomyx serve nope.jsonl` prints a URL, mints a room ID and registers it. Also
`log/store.ts:58` calls bare `JSON.parse(headerLine)`, so a malformed first line
throws a raw `SyntaxError` naming no file, while every other error in that
function carefully names it.

> The system can simultaneously claim live and disconnected. When failure modes
> are illegible, operators can't tell a benign ENOENT from something poking their
> loopback port. — Priya

**Rides along in the same diff:** `shutdown()` at `cli.ts:85-91` deregisters
*before* closing — six lines below the preflight. Fix it while you're there
(see R9 below).

### 3. R8 — the CLI has no argument grammar

*Criterion 3: 9-10/10. Score 57-59. **~2 days** (re-priced when R13 merged in).*

`parseFlags` at `cli.ts:20-36` scans for `--x` anywhere and hands positionals to
`rest[0]` blindly. Two more divergent copies live in `client/index.ts:12` and
`cli/seed.ts:17`. Measured against the published package:

```
roomyx serve --port 0 room.jsonl   → serves a file literally named "--port", on 4319
roomyx serve --help                → STARTS A SERVER and mints a room ID
roomyx serve room.jsonl --port     → port 1, because Number(true) === 1
roomyx serve room.jsonl --port abc → NaN → silently picks an ephemeral port
roomyx skills sync … --dryrun      → unknown flag, silently ignored
roomyx --help ; echo $?            → usage on stderr, exit 1
```

> `roomyx serve --help` booting a server is the single most damning line anyone
> produced, and it's damning for a reason that isn't parsing: the walkthrough
> asks an agent to drive this CLI, and the first thing any agent does with an
> unknown command is `--help`. — Marcus

**Absorbed into this item** (R13, R14 — one flag contract, one parser):
- `runRoomsList()` takes no arguments and hardcodes `defaultRegistryPath()`, so
  `rooms list --registry /nonexistent.json` prints "No live rooms" having read a
  different file. Silently.
- `client/index.ts:17` writes a bare trailing flag as `""`, and line 26's
  `flags["registry"] ?? default` doesn't catch empty string.
- Port defaults split by kind: **a discovered endpoint should be ephemeral, a
  pasted one must be fixed.** `serve` → `0` (nothing types a room's port; the
  registry carries it). `mcp` stays `4320` (walkthrough step 8 pastes it into a
  config that outlives the process). Changing `serve`'s published default needs
  a README note.

### 4. R4 — the package cannot speak at the moment it fails

*Criterion 3: 8-10/10. Score 54-58. **Half a day.***

`bin` points at `.ts` files with a `#!/usr/bin/env bun` shebang. On a machine
without Bun the failure is `/usr/bin/env: 'bun': No such file or directory` —
zero bytes of it from roomyx.

> A shebang is an `execve` dispatch handled by the kernel. There is no slot in
> `#!/usr/bin/env bun` for a diagnostic, no fallback, no "did you mean." When
> your interpreter is not guaranteed present, the `bin` entry is a launcher, not
> the program. — Théo

Two premises were tested rather than assumed, and both failed:

- `engines.bun` enforces nothing. A package declaring `engines.bun >=99.0.0`
  installs under `npm install --engine-strict` with exit 0 — npm's engine check
  only ever knew `node` and `npm`. *"A comment that looks like a constraint,
  which is worse than no constraint."*
- The "ships TypeScript, no build step" stance that seemed to block a fix isn't
  a recorded decision. A grep of both decision files for *build*, *transpile*,
  *shebang*, *bun* returns nothing across D-01..D-06 and installer D-01..D-04.
  It is README prose. **No carve-out needed — a doc edit.**

**Definition of done:** `bin.roomyx` and `bin.roomyx-client` become small
hand-written launchers with a **node** shebang that probe `PATH` for `bun` and
either exec the real TypeScript entry or print an install hint and exit 1. Node
is guaranteed present — npm just ran. Measured overhead: 27 ms against roomyx's
own ~140 ms baseline. Nothing is transpiled; the shipped TypeScript stays the
source of truth. Fixes a side issue too: `bin` pointing at `.ts` is why the
npm-generated Windows `.cmd` shim has nothing to work with.

**Hard acceptance criterion: the launcher must never fetch, install or bootstrap
Bun.** It probes and it prints a URL.

> "We made the error message nicer by downloading a runtime" would be the single
> worst trade on this board. An install-time network fetch is exactly what
> installer D-01 exists to refuse. — Priya

**Noted dissent, on the record:** R4 is the only item of the five whose failure
mode is *documented* — `README:18` says in bold that Bun must be on your PATH.
R1, R2 and R8 all bite the person who did everything right. That's a real
difference in class, and it argues for R4 fourth of the four rather than second.

### 5. R5 — the session reaper and the D-06 amendment

*Criterion 3: 4-8/10 — **argued into the set on merits, not scores**. Score
54-56. **~1 day**, explicitly **minus** the rebinding guard, which ships as S2.*

> Every other item on this board — all fourteen — requires the operator to do
> something to themselves. Run a command, mistype a flag, open a room, attach a
> client. R5 is the only item where the actor is not the operator and the
> operator's only contribution is *having a browser open*. That is a
> categorically different thing, and our rubric has nowhere to put it. — Priya

Measured: 400 `initialize` POSTs carrying `Origin: https://evil.example` and
`Host: roomyx.attacker.test` all completed the handshake, and RSS went
98 MB → 139 MB. ~102 KB retained per request, never reclaimed. Ten thousand
requests is a gigabyte.

The retention is a defect on its own, with no attacker in it: `onsessionclosed`
never fires, because the SDK client's `close()` only aborts locally — only
`terminateSession()` sends the DELETE. Every `rooms list`, every TUI reconnect
and every liveness probe leaks a whole `McpServer`. 200 *legitimate* cycles cost
+18 MB.

**Exfiltration first, exhaustion second.** After a rebind the page is
same-origin and can read responses — `room.get_transcript` at `since_seq=0`
hands over the entire private room transcript. That is confidentiality, and it
is why the guard has standalone value even once the map is bounded.

**This item is the reaper and the amendment. The guard ships as S2** — see the
corrections there: the guard **is** a constructor option and does reach this
transport, the dependency floor moves to `>=1.25.0` with it, and the D-06
amendment belongs in S2's commit.

**Acceptance criteria:**
- RSS returns to baseline after N connect/close cycles from a legitimate client.
- A request bearing an unknown `mcp-session-id` gets a 404, instead of minting
  an orphan transport that isn't in `sessions` and therefore can't be closed.
- `terminateSession()` replaces `close()` in `isRoomLive` and `RoomClient.stop()`.
- The D-06 amendment lands **in `docs/roomyx/decisions.md`** — *in S2's commit,
  not this one*: loopback binding does not constrain a browser; D-06's threat
  model enumerated process actors and never enumerated browsers; the remedy is
  not the auth D-06 deferred but the guard the SDK already ships, turned on.

> An argued exception that lives in a room transcript isn't an argued exception,
> it's a rumour. — Théo

**Why the guard is listed as S2 and not here:** it ships this week with S1's
payload removal. Listing R5 as an undifferentiated blob would mean that in three
months someone reads "R5: not done" and cannot tell that the exploitable half
shipped in week one.

---

## Below the line — real, reproduced, not scheduled

| | What | Criterion 3 | Size |
|---|---|---|---|
| **R7** | Liveness verifies *that a port answers*, not *which room answered*, and prunes live rooms from the file on a 500 ms timeout. A `SIGSTOP`'d healthy server was deleted from the registry; the server kept serving and the client said "No live roomyx rooms found." Ports get reused, so a crashed room's port can be adopted under the old room's id — confused deputy by port reuse. **Fix:** a `room.health` tool returning the room id the server registered under; the probe compares it to the entry. **Identity mismatch is the one case where deleting is correct — a timeout never is.** `pid` (written at `cli.ts:79`, read by nobody) is a cheap pre-filter, not the assertion: pids are reused too, and `process.kill(pid,0)` only sees same-user processes. Installer D-03 already asks for this and the code does something weaker. | 7-8 | afternoon + tool |
| **R9** | `roomyx serve` does not die on SIGTERM while a client is attached — `httpServer.close()` drains open connections and an attached TUI holds an SSE stream. Still alive 30 s after `kill -TERM`. And `cli.ts:86` deregisters *first*, so the room vanishes from the registry while the process lives on, holding the port. **`test/cli-serve-lifecycle.test.ts` passes because it tests the unattached case; the attached case is the one the README documents.** A green test certifying the configuration nobody runs. *Rides along with R2 — same function, six lines apart.* | 8-9 | afternoon |
| **R10** | `get_transcript` has no `limit`, and its consumer on the management path is a language model: a cold attach at `since_seq=0` shipped 3.8 MB in a single text block. **That isn't 20 ms of CPU, it's a context window.** The caching half — `loadRoomLog` re-reads and zod-validates the whole append-only file per call — is a real inefficiency but speculative until someone runs a room that long. Split: the `limit`-and-cursor half has a present victim; memoization is a follow-up. | 5-7 | afternoon → 2 days |
| **R12** | The status bar drops the goal threshold. `GoalContract` carries `criteria` and `fail_below`/`pass_at_or_above`; `status-bar.ts` shows only `goal_statement`, truncated mid-word. The room exists to cross a number and the number is invisible. Should inherit R1's wrap primitive rather than hand-roll a second one. | 5-7 | half a day |

## Found while planning the work, not in the room

Three things surfaced when this backlog was turned into an implementation plan.
They are recorded here rather than folded into the fifteen, because the room
never saw them and never scored them.

- **The release smoke test cannot fail, and would never have caught R8.**
  `release.yml:91` runs `./.release/prefix/bin/roomyx --help > /dev/null 2>&1 ||
  true` — output discarded, exit code discarded, and `|| true` swallowing what's
  left. `roomyx --help` exits 1 today (that's half of R8) and this step passed
  every release. A smoke test that cannot fail is a green light wired to
  nothing. Adjacent to R8; fix it in R8's PR.
- **R3 and R8 collide and neither says so.** R8 unifies three flag parsers, one
  of which is `src/cli/seed.ts:17`. R3 promotes that same file's behaviour into
  `roomyx room new|append` and may supersede it entirely. Whichever ships second
  inherits work the other made pointless. R3 goes first by build order, so R8's
  parser scope should be settled *after* R3 lands, not planned against three
  files that may be two.
- **There is no `CHANGELOG.md`.** S1's "its own changelog line" has nowhere to
  go. Either create one, or satisfy the intent with a dedicated commit title
  that `--generate-notes` will surface in the GitHub release.

## Already fixed

**`testing-story.md` step 9 overclaimed the skill-sync safety.** It said roomyx
refuses unrecorded content "even with `--yes`… until you say so again." The code
disagrees: `skill-sync.ts:78` is a single gate, `targetHasIndependentChanges &&
!options.yes`, so one `--yes` clears both refusal reasons in the same run.
Priya's MCP call returned `written: true` in the same response as the warning
that said it was refusing. The walkthrough now states what the code does, and
notes that making the second refusal genuinely separate would be a code change.

Worth naming: that sentence was written the same morning, by the same hand that
wrote the walkthrough, and survived a verified end-to-end run — because the run
exercised the refusal path and the writing path separately and never the
sequence the sentence described.

## Corrections the room made against its own interest

Recorded because they are the reason to trust the list.

- **Zara** measured a 3,000-row cold attach at 150 ms to build and 44 ms to draw
  and refused to co-sign a rendering-performance claim: *"a visible hitch, not a
  fire. I'm not going to co-sign an item I just measured as fine."*
- **Théo** retired his own `height: 1` finding into Zara's stronger one, then
  retired his own R11 into R1 after ranking it second: *"That's a better outcome
  than winning the argument."*
- **Omar** dropped his port item to make room for work in someone else's lane,
  then re-priced his own advocated item *downward* — which cost it the slot:
  *"A decision already made doesn't need a slot on a prioritisation list, it
  needs a commit."*
- **Marcus** refused to abstain on R4 after his premise was disproved: *"A
  finding whose premise was mine and whose evidence and fix are someone else's
  is not mine. Abstaining would be claiming authorship of being wrong."* He also
  corrected his own evidence for S3: *"I edited that file to see whether it would
  break. Treat my reproduction as demonstrating the mechanism, not the
  frequency."*
- **Priya** argued her own item out of the slot on sizing: *"Something that
  closes a live arbitrary-path write in under an hour doesn't need a slot on a
  five-item list. It needs to be merged before lunch."*
- **Omar**, conceding the fifth slot: *"You cannot hold that the instrument is
  deficient when it flattens your judgement and authoritative when it confirms
  it."*
- **Marcus**, conceding it back: *"The slot was never deciding what gets fixed.
  It was deciding what the list says. I was holding the fifth slot for work
  already scheduled."*
