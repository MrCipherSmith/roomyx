# Fix-round review — flow 001

Three reviewers over `git diff b9ec8cb..HEAD -- src test` (38 files, +1821/-298),
dispatched as a **fix round**: the subject is the fixes, not the code they
fixed. That class is systematically under-found for a structural reason — a fix
arrives framed as the answer to a finding, so it is read as an answer rather
than as new code.

It found five defects the fixes introduced, two of them independently by two
reviewers, and four places where the fixes' own verification record was wrong.
The flow's completion gate refused to close the flow until this round existed,
and it was right to.

## Regressions the fixes introduced — all fixed

| | What | Reproduced |
| --- | --- | --- |
| **The idle sweeper evicted live clients** | M6 reasoned that a minute of silence means the client is gone. True of roomyx's own TUI, which polls at 1s; false of `roomyx mcp`, documented for Claude Code, Codex and keryx, whose clients call a tool when a model decides to. | Connect, call a tool, idle 95s → the next call fails **permanently**: the SDK client never clears its session id on a 404 and never re-initializes. The fix worked once and then killed the primary integration surface. |
| **A persistent tool error was reported once per poll** | B3 rightly put the server's text in the transcript, but a tool error is usually a property of the file, not a transient — a log line the reader refuses stays refused. | 8 identical reports in 6 seconds ≈ 80 transcript entries a minute, each allocating a renderable never freed. That is the pool exhaustion B2 fixed, re-entered through another door. |
| **The 404 closed half a class while the comment claimed both** | A request carrying *no* session id still reaches `createSession` — it must, that is how `initialize` arrives — and if it was not an initialize the transport never enters the map. | 15 session-less `tools/list` POSTs minted 15 transports, tracked 0. |
| **`stop()` left the single-flight token dangling** | `clearTimeout` cancelled the pending reconnect but left the field set, and `scheduleConnect` uses that field as its token. | A stopped client could never be restarted: `start()` returned immediately and it was inert for good. |
| **The export containment check was a tautology that misfired at `/`** | It compared a value to the expression that had produced it, paired with a `startsWith(root + sep)` test that inverts when root is `/`. | Started in a container with no working directory, every export was refused with "refusing to write outside the working directory" — the opposite of what happened. |

### One finding corrected, in the fixes' favour

The untracked-transport finding claimed unbounded growth — "one per request,
without bound". **It does not reproduce.** Nothing holds a reference to those
transports, so they are collected: 400 session-less POSTs retain 2.8 MB with the
close and 2.7 MB without. The mechanism is real and the close stays as
deterministic hygiene; the leak is not, and the severity rested on it.

A review is not a thing to accept uncritically, and recording the correction is
the same discipline as recording the finding.

## Where the verification record was wrong

The fixes were each claimed to be verified by mutation. An independent pass
published its whole table — 27 mutations, casualties **and** survivors — and
found four claims that did not hold.

- **The post-stop guard note miscounted.** It said four redundant guards, and
  that removing all four turns the test red. There are five `this.stopped`
  sites, and what had been mutated as "all four" included `stop()`'s generation
  bump, which is a different mechanism. Measured a family at a time: all five
  guards removed → green; only the generation bump removed → green; both → red.
  Two redundant families, either sufficient. Corrected in the test's own
  comment, because a record that miscounts is worse than none — the next person
  removes a guard as dead code, gets a green suite, and cites the record.
- **The renderable test certified half its name.** It measured the map's *size*,
  which is net, so 100 polls destroying and allocating five rows each nets to
  zero: the skip-unchanged-roster gate could be deleted with no signal. It now
  also asserts the highest renderable number, which is monotonic. **Fixed.**
- **Nothing tested the client half of the session release** — the half that was
  broken. The file drove its own bespoke client and called `terminateSession`
  itself, proving the server honours a DELETE, which was never in doubt.
  Deleting the client call left all 261 tests green. **Fixed** with a recording
  proxy in front of a real `RoomClient`.
- **A raw NUL byte made `export-name.test.ts` binary** to git and invisible to
  ripgrep, so this repository's own mandated search path reported the export fix
  as untested and its diffs printed as `Bin … bytes`. A "binary file matches"
  warning had already appeared during these runs and was stepped around with
  `strings` rather than asked about. **Fixed.**

## Worked after the operator declined to defer them

- **Six gates survive their own deletion** with all tests green:
  `transport.onclose`, `closeAllConnections()`, `runUntilSignal`'s re-entry
  guard, the `cleanup()` ordering inside `.finally()`, the backoff ceiling, and
  the roster `clip`'s `width <= 0` branch (unreachable as constructed).

  It was filed as seven. The verifier re-ran each and found the `isError` branch
  is **not** a survivor — deleting it fails both tool-error cases — so that
  claim was repeated from the reviewer without being checked. Corrected here
  rather than left standing.
  Several carry comments asserting they are load-bearing, which is what the next
  author will read instead of a test.
- **Neither reconnect mechanism is pinned** — not the generation bump in
  `handleDisconnect`, not the single-flight timer check, not both together. The
  reviewer was explicit that they could **not** reproduce the doubling with both
  removed and were therefore reporting a coverage gap, not claiming the defect
  returns. That distinction is the right way to file it, and it is why this is
  open rather than urgent: nothing measures loop count, so neither they nor
  anyone else can tell.
- **The 404 branch returns before the SDK's header validation**, making it the
  one response path not Host/Origin-checked. Not exploitable — session ids are
  122-bit random, so the oracle is worthless — but the guard's coverage is now
  "every path except one".
- **`isRoomLive` still does not identify the room.** The pid check narrows the
  window and skips a 500 ms probe per dead entry; it does not close it. Closing
  it means comparing `room.get_state` against the entry's `logPath`.
- **M13 was applied to the two files that already had predicate waits** and not
  to the eleven fixed sleeps the same diff added.
- Two `info` items outside this round's diff: `--acknowledge-non-loopback` binds
  a non-loopback address while `allowedHosts` stays loopback-only, so the escape
  hatch cannot be used; and `roomyx.rooms.list` prunes the registry, so the MCP
  surface is nearly but not exactly read-only.

## The mutation table, published whole

Claimed as published and not published — the verifier caught that the named
evidence contained no table at all. Here it is. Casualties **and** survivors,
because a table with only casualties reads as cherry-picking. Each mutation
applied alone against the fix diff and reverted before the next.

**Red — the gate is pinned by its own test:** the scrollbar row
(`horizontalScrollbarOptions`, 3 fail, and precisely the three boundary heights);
the shutdown order (1); the shutdown re-entry guard (1); `withLock` around
`appendMessage` (3, and again under load); the 404 for an unknown session (3 of
4); the roster `clip` (3) and its ellipsis marker (2); `messageLineSchema`
validation on write (4); `helpBody` fitting (4); `Object.hasOwn` in the flag
lookup (1); the `init` staged-skill guard (1); `syncSkill`'s fail-closed default
(3 across 2 files); closing sessions before `httpServer.close()` (4, the whole
shutdown file); `SIGHUP` in `runUntilSignal` (1); the `isPidAlive` call site (1);
the `handleToolError` branch in `pollState` (2); `destroyRecursively()` in the
roster and in the chat view (1 each); and — found by the verifier, contradicting
the survivor list below — the `isError` branch in `callTool` (2).

**Green — the gate survives its own deletion:** `transport.onclose`;
`closeAllConnections()`; `runUntilSignal`'s re-entry guard; the backoff ceiling;
the roster `clip`'s `width <= 0` branch, unreachable as constructed; the
`cleanup()` ordering inside `.finally()`; and both reconnect mechanisms,
individually and together.

Baseline before: 255 pass. After: 262 pass, 0 fail, tree clean.

## Stage counts

Corrected after the verifier showed the first version did not add up — it
counted `fix-03` as both fixed and corrected, and called 9 findings open when
the prose lists 7.

- Dispatched: 3 reviewers (logic, testing-practices, security-code), then 1
  verifier over all 19 findings.
- Raised: 19.
- Reproduced independently by the orchestrator before acting: 6.
- Verifier verdicts: 17 confirmed, **2 refuted**, 0 unverifiable. Both
  refutations are against this report's own claims, not against a reviewer's.
- Dispositions: 12 `acted-on`, 5 `dismissed-deprioritised`, 2
  `dismissed-out-of-scope`.
- Of the 12 acted on: 5 were regressions the fixes introduced, 4 were the
  verification record being wrong, and 3 required no code change (two
  confirmations and this table).
- Corrected against a reviewer: 1 (`fix-03`'s memory impact), and it is counted
  under `acted-on`, not separately.
- Left open with a reason: 7, listed above.

```json keryx:findings
[
 {
  "id": "fix-01",
  "reviewer": "review-logic",
  "severity": "major",
  "file": "src/server/http-transport.ts",
  "line": 128,
  "symbol": "sweeper",
  "problem": "The idle sweeper evicted sessions a live client still owned; eviction is one-way because the SDK client never re-initializes after a 404.",
  "impact": "roomyx mcp worked once and was dead for the rest of the host's lifetime; measured at 95s idle.",
  "suggested_fix": "Window must mean certainly-gone, not probably-gone: raised to 30 minutes with the reasoning recorded.",
  "evidence": "connect, call, idle 95s, next call throws Unknown session; found independently by review-logic and review-security-code.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 7dde8b2729818b44653565c6753ab18b2e3559cd"
  },
  "class_scope": {
   "sites": [
    "src/server/http-transport.ts:128",
    "src/server/serve.ts:21",
    "src/mcp-management/server.ts:105"
   ],
   "enumeration_method": "`keryx ctx rg \"serveMcpOverHttp\" src --all` returns one definition and exactly two call sites, so the sweeper is unconditional for both servers. The room server escapes only incidentally, because its TUI polls at 1s; there is no per-server guard. `IDLE_SESSION_MS` is written once, at http-transport.ts:128."
  }
 },
 {
  "id": "fix-02",
  "reviewer": "review-logic",
  "severity": "major",
  "file": "src/client/index.ts",
  "line": 123,
  "symbol": "onToolError",
  "problem": "A persistent tool error was appended to the transcript once per poll, undeduplicated and unbounded.",
  "impact": "~80 identical entries a minute, each allocating a renderable never freed - the same pool exhaustion B2 fixed.",
  "suggested_fix": "Report once per distinct message; a successful poll makes the next occurrence news again.",
  "evidence": "8 reports, 1 distinct message, in 6 seconds against a real serve.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 7dde8b2729818b44653565c6753ab18b2e3559cd"
  },
  "class_scope": {
   "sites": [
    "src/client/mcp-client.ts:200",
    "src/client/index.ts:123",
    "src/client/index.ts:115"
   ],
   "enumeration_method": "`keryx ctx rg \"appendSystemLine\" src --all` gives the definition (chat-view.ts:120) and exactly two call sites. index.ts:115 is guarded by `previous !== status`, so it emits once per transition; index.ts:123 was the unguarded one, fed by mcp-client.ts:200 which called the event on every rejection. The dedupe is placed at the emitter rather than at either consumer, so a third consumer cannot reintroduce it."
  }
 },
 {
  "id": "fix-03",
  "reviewer": "review-logic",
  "severity": "major",
  "file": "src/server/http-transport.ts",
  "line": 149,
  "symbol": "createSession",
  "problem": "The 404 refused requests naming an unknown session but left the no-session-id path minting untracked transports.",
  "impact": "Mechanism confirmed: 15 session-less POSTs minted 15 transports, tracked 0. The claimed unbounded memory growth does NOT reproduce - 400 POSTs retain 2.8MB with the fix and 2.7MB without.",
  "suggested_fix": "Close any transport that did not become a session.",
  "evidence": "instrumented createSession counter; heap measured with forced GC either side.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 7dde8b2729818b44653565c6753ab18b2e3559cd; severity corrected downward, impact refuted by measurement"
  },
  "class_scope": {
   "sites": [
    "src/server/http-transport.ts:149",
    "src/server/http-transport.ts:155"
   ],
   "enumeration_method": "Derived from the guard rather than grepped: the set of requests reaching `createSession()` is {sessionId undefined} union {sessionId unknown}. The 404 removes the second member; the first is untouched and only its `initialize` subset ever reaches `onsessioninitialized`. Confirmed by counting createSession calls for each member separately - 15 session-less POSTs minted 15, 15 unknown-id POSTs minted 0."
  }
 },
 {
  "id": "fix-04",
  "reviewer": "review-logic",
  "severity": "minor",
  "file": "src/client/mcp-client.ts",
  "line": 107,
  "symbol": "stop",
  "problem": "stop() cancelled the pending reconnect but left reconnectTimer set, and scheduleConnect uses it as its single-flight token.",
  "impact": "A stopped client could never be restarted.",
  "suggested_fix": "Clear the field, not just the timer.",
  "evidence": "start() after stop() produced no status events; control client produced connected.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 7dde8b2729818b44653565c6753ab18b2e3559cd"
  }
 },
 {
  "id": "fix-05",
  "reviewer": "review-security-code",
  "severity": "major",
  "file": "src/client/export-name.ts",
  "line": 51,
  "symbol": "nextFreeExportPath",
  "problem": "The containment check compared a value to the expression that produced it, and its second clause inverts when cwd is the filesystem root.",
  "impact": "Every export refused in a container with no working directory, with a message stating the opposite of what happened.",
  "suggested_fix": "dirname equality against the resolved root.",
  "evidence": "nextFreeExportPath('/') returned escapes-cwd; found independently by review-logic and review-security-code.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 7dde8b2729818b44653565c6753ab18b2e3559cd"
  },
  "class_scope": {
   "sites": [
    "src/client/export-name.ts:51",
    "src/client/index.ts:223"
   ],
   "enumeration_method": "`keryx ctx rg \"nextFreeExportPath|exportBaseName\" src --all` gives two definitions and one call site, which passes `process.cwd()`. The containment check exists at exactly one place, so the class is that one site plus its only caller."
  }
 },
 {
  "id": "fix-06",
  "reviewer": "review-testing-practices",
  "severity": "minor",
  "file": "src/client/mcp-client.ts",
  "line": 106,
  "symbol": "stop",
  "problem": "The recorded verification note for the post-stop property miscounted the guards and attributed the red run to the wrong mechanism.",
  "impact": "A record that miscounts is cited by the next person removing a guard as dead code.",
  "suggested_fix": "Record the measured result: two redundant families, either sufficient, both removed is red.",
  "evidence": "five guards removed -> green; generation bump removed -> green; both -> red.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 4dd78b90bd5c0fee3ce9b230baf56ebab55316f9"
  }
 },
 {
  "id": "fix-07",
  "reviewer": "review-testing-practices",
  "severity": "minor",
  "file": "test/client/renderable-lifetime.test.ts",
  "line": 36,
  "problem": "The test measured net registry size, so the skip-unchanged-roster gate could be deleted with no signal.",
  "impact": "The gate whose absence killed the client in 2.7 hours had no barrier.",
  "suggested_fix": "Also assert the highest renderable number, which is monotonic.",
  "evidence": "deleting sameRoster left 261 green; now turns it red.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 4dd78b90bd5c0fee3ce9b230baf56ebab55316f9"
  }
 },
 {
  "id": "fix-08",
  "reviewer": "review-testing-practices",
  "severity": "minor",
  "file": "src/client/mcp-client.ts",
  "line": 52,
  "symbol": "endSession",
  "problem": "Nothing tested the client half of the session release, which is the half that was broken.",
  "impact": "Deleting the only terminateSession call left all 261 tests green.",
  "suggested_fix": "Drive a real RoomClient through a recording proxy and assert its ids stop routing.",
  "evidence": "deletion now turns the new case red.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 4dd78b90bd5c0fee3ce9b230baf56ebab55316f9"
  }
 },
 {
  "id": "fix-09",
  "reviewer": "review-testing-practices",
  "severity": "minor",
  "file": "test/client/export-name.test.ts",
  "line": 39,
  "problem": "A raw NUL byte made the file binary to git and invisible to ripgrep.",
  "impact": "The repository's own mandated search path reported the export fix as untested; diffs printed as Bin bytes.",
  "suggested_fix": "Use the escape sequence.",
  "evidence": "rg found nothing before, finds it after.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 4dd78b90bd5c0fee3ce9b230baf56ebab55316f9"
  }
 },
 {
  "id": "fix-10",
  "reviewer": "review-testing-practices",
  "severity": "minor",
  "file": "src/server/http-transport.ts",
  "line": 110,
  "problem": "Seven gates added by the fix diff survive their own deletion with all tests green.",
  "impact": "Each is correct today; the next edit to any of them is unprotected, and several carry comments asserting they are load-bearing.",
  "suggested_fix": "Pin the four where a fixture is cheap; accept the rest as belt-and-braces and say so.",
  "evidence": "each deleted alone, full suite 261 pass.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 25c80a093c404c2ed39004c5de4741d0b385a3fb — the CLI re-entry guard is pinned; transport.onclose measured unpinnable and labelled; the clip width guard labelled as unreachable"
  }
 },
 {
  "id": "fix-11",
  "reviewer": "review-testing-practices",
  "severity": "minor",
  "file": "src/client/mcp-client.ts",
  "line": 273,
  "symbol": "handleDisconnect",
  "problem": "Neither reconnect mechanism is pinned, individually or together; nothing in the suite measures loop count.",
  "impact": "Coverage gap. The reviewer explicitly could not reproduce the doubling with both removed and did not claim the defect returns.",
  "suggested_fix": "Count callTool invocations under induced faults and assert the rate stays within a constant factor.",
  "evidence": "both mechanisms deleted, 261 pass.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 25c80a093c404c2ed39004c5de4741d0b385a3fb — a request-rate test added, and labelled in the file as NOT a barrier: the pre-fix shape still passes it"
  }
 },
 {
  "id": "fix-12",
  "reviewer": "review-security-code",
  "severity": "minor",
  "file": "src/server/http-transport.ts",
  "line": 149,
  "problem": "The 404 branch returns before the SDK's header validation, so it is the one response path not Host/Origin-checked.",
  "impact": "Not exploitable - session ids are 122-bit random - but the guard's coverage is now every path except one.",
  "suggested_fix": "Validate Host/Origin before the 404, or move the branch behind handleRequest.",
  "evidence": "evil Host + unknown session id returns 404 where evil Host alone returns 403.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 25c80a093c404c2ed39004c5de4741d0b385a3fb — Host/Origin validated before the 404"
  }
 },
 {
  "id": "fix-13",
  "reviewer": "review-security-code",
  "severity": "minor",
  "file": "src/installer/registry.ts",
  "line": 171,
  "symbol": "isRoomLive",
  "problem": "The pid check narrows the port-reuse window but does not close it; neither step ties the answer to the room.",
  "impact": "A recycled pid plus a rebound port still resurrects a dead room. A false ESRCH would prune a live one.",
  "suggested_fix": "Compare room.get_state against the entry's logPath.",
  "evidence": "neither isPidAlive nor the probe consults logPath.",
  "confidence": "medium",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 25c80a093c404c2ed39004c5de4741d0b385a3fb — RoomState carries log_path and the probe compares it"
  }
 },
 {
  "id": "fix-14",
  "reviewer": "review-testing-practices",
  "severity": "minor",
  "file": "test/client/tool-error.test.ts",
  "line": 131,
  "problem": "M13 was applied to the two files that already had predicate waits, not to the eleven fixed sleeps the same diff added.",
  "impact": "No flake reproduced under load; the demonstrated cost was a false pass at the previous commit, now gone.",
  "suggested_fix": "Lift the until() helper into a shared test helper and use it.",
  "evidence": "eleven setTimeout sites enumerated in tool-error.test.ts and server/shutdown.test.ts.",
  "confidence": "medium",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 25c80a093c404c2ed39004c5de4741d0b385a3fb — one shared until() helper; the two sleeps that remain are assertions about time"
  }
 },
 {
  "id": "fix-15",
  "reviewer": "review-security-code",
  "severity": "info",
  "file": "src/server/http-transport.ts",
  "line": 99,
  "symbol": "allowedHosts",
  "problem": "--acknowledge-non-loopback binds a non-loopback address while allowedHosts stays loopback-only, so the escape hatch cannot be used.",
  "impact": "No security impact; the failure is in the safe direction. An operator flag that appears to work and does not.",
  "suggested_fix": "Add the bound host to allowedHosts when the flag is set, or document the reverse-proxy assumption.",
  "evidence": "lines are unchanged context in this diff, not introduced by it.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 25c80a093c404c2ed39004c5de4741d0b385a3fb — the bound host joins the allowlist when the operator acknowledged it"
  }
 },
 {
  "id": "fix-16",
  "reviewer": "review-security-code",
  "severity": "info",
  "file": "src/mcp-management/server.ts",
  "line": 48,
  "symbol": "roomyx.rooms.list",
  "problem": "After M5 the one remaining network-triggered write is the registry prune inside listLiveRooms.",
  "impact": "Not a vulnerability - content is not caller-controlled - but the MCP surface is nearly, not exactly, read-only.",
  "suggested_fix": "Give listLiveRooms a prune flag and pass false from the tool.",
  "evidence": "skills.sync verified unable to write; rooms.list writes the registry.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 25c80a093c404c2ed39004c5de4741d0b385a3fb — listLiveRooms takes prune; the MCP tool passes false"
  }
 },
 {
  "id": "fix-17",
  "reviewer": "review-architecture",
  "severity": "info",
  "problem": "Three abstractions extracted by the fixes were judged load-bearing rather than ceremonial: http-transport.ts, keymap.ts, transcript.ts.",
  "impact": "None. Recorded so a later round does not re-litigate inlining them.",
  "suggested_fix": "Keep them.",
  "evidence": "gdgraph affected shows real dependents for each.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 4dd78b90bd5c0fee3ce9b230baf56ebab55316f9 — confirmation, no code change required"
  }
 },
 {
  "id": "fix-18",
  "reviewer": "review-testing-practices",
  "severity": "info",
  "problem": "Mutation-pass record published whole: 27 mutations, casualties and survivors both.",
  "impact": "Evidence base. A table with only casualties reads as cherry-picking.",
  "suggested_fix": "None - this is the record.",
  "evidence": "15 mutations red, 12 green, each applied alone and reverted; tree restored and suite green afterwards.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 4dd78b90bd5c0fee3ce9b230baf56ebab55316f9 — docs/roomyx/fix-round-2026-09-09.md"
  }
 },
 {
  "id": "fix-19",
  "reviewer": "review-security-code",
  "severity": "info",
  "problem": "The DNS-rebinding guard survived the fix round's edits intact.",
  "impact": "None - a confirmation, filed because its absence would have been a blocker.",
  "suggested_fix": "None.",
  "evidence": "evil Origin and evil Host each return 403 with the SDK's own message.",
  "confidence": "high",
  "disposition": {
   "state": "acted-on",
   "evidence": "commit 4dd78b90bd5c0fee3ce9b230baf56ebab55316f9 — confirmation, no code change required"
  }
 }
]
```
