# roomyx improvements — room log

**Started:** 2026-09-09. Only the dispatcher writes to this file.

## Goal contract

**Goal statement.** Produce a ranked list of concrete improvements to roomyx
(published as `@mrciphersmith/roomyx@0.4.0`), each specific enough to hand to an
implementer, with the room converged on the top set.

**Success criteria.** Each proposed improvement is scored 0-10 on six
criteria, out of 60:

1. **Concrete** — names the file, command, or behaviour. "Improve UX" scores 0.
2. **Grounded** — based on the published code, docs, or the walkthrough, not on
   what the package might hypothetically be.
3. **Someone hits this** — a real person running roomyx encounters it, and the
   scorer can say who and when.
4. **Honest effort** — a stated size (an afternoon / a week / a rewrite) that
   survives scrutiny.
5. **Consistent with the project's decisions** (`docs/roomyx/decisions.md`
   D-01..D-06, `docs/roomyx-installer/decisions.md` D-01..D-04) — or an explicit,
   argued case to change one of them.
6. **Not already done** — checked against 0.4.0, not against an older memory of
   the package.

**Threshold:** an item makes the final list at **40/60 or above**. Below that is
a real fail, however good it sounds in conversation.

**Convergence requirement.** The goal is met when at least five items clear 40
*and* every active participant explicitly backs the final ranked set — a high
score with someone still arguing is not convergence.

## Roster

| Name | Role |
| --- | --- |
| Theo | PLT / devtools engineer — CLI and TUI ergonomics, language tooling |
| Marcus | DX and OSS adoption — packaging, docs, first-run experience |
| Priya | Security researcher — threat models, auth, supply chain |
| Omar | Database / backend architect — servers, registries, concurrency |
| Zara | UI/UX designer — terminal interfaces, information design |

## What the room is looking at

`@mrciphersmith/roomyx@0.4.0`, source at `/home/altsay/roomyx`. Two binaries
(`roomyx`, `roomyx-client`), an MCP server per room, a management MCP server, a
room registry, skill-sync. Docs in `docs/`, including a verified walkthrough in
`docs/roomyx/testing-story.md`.

---

## Transcript

**Marcus:** Marcus here. I ran it rather than read it — installed copy, scratch dir, `roomyx init`, `serve`, the lot. Repo root `/home/altsay/roomyx`.

Here's my honest read: the hard parts of this package are done well. The registry lockfile, the two-guard skill sync, the "no dispatcher, so `accepted: false`" answer — that's the work of someone who has been burned before. What's missing is everything between `npm install -g` and the first moment a person sees a room. That gap is what kills devtools at week three, not architecture.

Four things, ranked.

**M1 — There is no supported way to create a room log.** README:36 says `roomyx serve path/to/room.jsonl`. Nothing anywhere tells you where `room.jsonl` comes from. The only tool that makes one is `src/cli/seed.ts`, which is not in `package.json`'s `bin`, appears zero times in the README (I grepped), and is documented only in `docs/roomyx/testing-story.md:105` as `bun "$(npm root -g)/@mrciphersmith/roomyx/src/cli/seed.ts"`. Reaching into a global node_modules path to use a tool's own file is the sound of a package that hasn't decided that file is a feature. Fix: promote it — `roomyx room new <path> --goal --roster`, `roomyx room append`. Half a day. This is the single number that matters: time-to-first-room.

**M2 — `roomyx init` silently clobbers the staged skill.** `src/installer/init.ts:44` is an unconditional `copyFileSync`. I appended a line to `.roomyx/skills/startup-room/SKILL.md`, re-ran `roomyx init`, and the line was gone. No warning, no `.bak-*`, no hash record. Meanwhile `skills sync` guards the *same class of file* with two refusals, a timestamped backup and `lastSyncedHashes`. Installer D-02 exists specifically to prevent "тихая перезапись живого, дорабатываемого вручную файла" — and `init` does exactly that to the copy it owns. Route init's staging through `syncSkill`. An afternoon.

**M3 — `roomyx serve` on a path that doesn't exist reports success.** Verified: served `nope.jsonl`, printed a URL, minted `r-887kko`, registered it in the registry. `loadRoomLog` is lazy, so the failure surfaces later, per-tool-call, inside the TUI — which is precisely what testing-story.md's own "what to report back" asks about ("any place the TUI showed nothing rather than showing a reason"). One `loadRoomLog()` preflight in `runServe` before `serve()`. An hour. Related: `src/log/store.ts:58` calls bare `JSON.parse(headerLine)`, so a malformed first line throws a raw `SyntaxError` with no path, while every other error in that function carefully names the file.

**M4 — `roomyx --help` and `-h` fall through to the usage string and exit 1.** No per-command help at all. Small, but `--help` exiting non-zero is the kind of thing that breaks a shell completion script and makes an agent driving the CLI guess. An afternoon.

One I'd rather the room argue than claim: `engines.bun` is not enforced by npm, so a Node-only machine installs cleanly and then `roomyx` dies with a kernel-level `env: bun: No such file or directory` — not one byte of roomyx's own text. The README warns about it; the artifact doesn't. Fixing that properly bumps into the deliberate "ships TypeScript, no build step" stance, so I want @Theo and @Omar on it before I score it.

**Zara:** Right. I went and looked. Then I rendered it, because reading a TUI's source tells you what someone intended, not what a person sees.

I ran `ChatView` under `@opentui/core`'s headless test renderer (published 0.4.0, `$(npm root -g)/@mrciphersmith/roomyx`, byte-identical to git main). Here's a room with exactly one message in it:

```
[connecting…]
> Ann
```

Nothing. Empty pane. **The first message of every room is never drawn.** Two messages → you see the second. Twelve → you see 2 through 12. It's a consistent one-row over-scroll from `stickyScroll: true, stickyStart: "bottom"` in `src/client/screens/chat-view.ts:36`. The testing story literally asks testers to report "any place the TUI showed nothing rather than showing a reason" — this is that, on the opening line of every room. And `test/client/render.test.ts` doesn't catch it because it only asserts roster names and the goal statement; it never once asserts a message body appears.

Second thing in the same frame, a realistic ~300-char turn at 100 cols:

```
> Юки        Омар: This is what an actual room message looks like: several senten
  Омар       Зара: And the next message after it.
```

`src/client/components/message-row.ts` hardcodes `height: 1`. Every message is one line, hard-clipped, no wrap, no ellipsis, no indication anything was cut. Nobody in a working room writes in 76 columns. So the primary content of this product — what the participants actually said — is the one thing you cannot read. Also silently dropped: `kind` and `in_reply_to`, both of which exist in `MessageEnvelope` and are the only structure a reader has for telling a challenge from an answer.

Third: `src/client/index.ts:120-121` binds `↑`/`↓` to the roster. There is **no key that scrolls the transcript.** The testing story promises "if you had scrolled up to read history, the view does not yank you back down" — with the keyboard you cannot scroll up at all. Same for the agent modal: it opens, and `Esc` is the only key it answers.

My three, ranked:

1. **Message rendering is the product.** Wrap bodies to the pane width, show `kind` and a reply marker, fix the sticky-bottom off-by-one, and add a render test that asserts a body string with a known-long message. ~2 days, most of it the sticky-scroll investigation.
2. **Bind transcript scroll** — PgUp/PgDn/Ctrl-U/Ctrl-D in both chat view and modal. An afternoon.
3. **The status bar drops the threshold.** `GoalContract` carries `criteria` and `fail_below`/`pass_at_or_above`; `status-bar.ts` shows only `goal_statement`, truncated mid-word. The room exists to cross a number, and the number is invisible. Half a day.

None of this touches D-01..D-06 — it's all read-side rendering, the log keeps one writer.

Am I tunnelling into the TUI? Yes, deliberately, on my first turn — it's my patch and nobody else has rendered it. @Marcus, @Theo: please pull us out to first-run and CLI, I don't want the room to become a rendering bug review.

**Théo:** I read the source, then I ran the thing, because with tools the second one is the only one that counts. Four findings, in the order I'd fund them.

**1. There is no argument grammar.** `src/cli.ts:20-36` has a `parseFlags` that scans for `--x` anywhere and hands positionals to `rest[0]` blindly. Two more copies of the same idea, with different semantics, live in `src/client/index.ts:12` and `src/cli/seed.ts:17`. What that costs, measured, not guessed:

```
$ roomyx serve --port 0 room.jsonl
roomyx serving /…/trial/--port at http://127.0.0.1:4319/mcp   ← serves a file named "--port", on 4319
$ roomyx serve --help
roomyx serving /…/trial/--help at http://127.0.0.1:4319/mcp   ← --help *starts a server*
$ roomyx serve room.jsonl --port
permission denied 127.0.0.1:1                                  ← Number(true) === 1
$ roomyx serve room.jsonl --port abc                           ← NaN → silent ephemeral port
$ roomyx skills sync … --dryrun                                ← unknown flag, silently ignored
$ roomyx --help ; echo $?  →  usage on stderr, exit 1
```

Options-before-positional is a convention older than most of us. `docs/roomyx/testing-story.md` step 6 says the point of that step is that the CLI be "legible to an agent driving it" — an agent learns flags from `--help`, and `--help` here either exits 1 or boots a server. One shared parser, unknown-flag rejection with a did-you-mean, numeric validation, real `--help` per subcommand. An afternoon for the parser, two days with the tests. Nothing in D-01..D-06 objects.

**2. The client reports "disconnected" for errors that are not disconnections.** `src/client/mcp-client.ts:113-118` ignores `result.isError` and `JSON.parse`s the text regardless. I served a path that doesn't exist:

```
rooms list  → r-3r5gfz  port=4455  log=…/typo-room.jsonl     (confirmed "live")
get_state   → {"isError":true,"…text":"ENOENT: no such file or directory…"}
```

`JSON.parse("ENOENT: …")` throws, `.catch()` fires, `handleDisconnect()` runs. The user gets a blank room, the word *disconnected*, and a reconnect loop against a perfectly healthy server — while `rooms list` swears the room is live, because liveness (`registry.ts:216-222`) is the `initialize` handshake and never touches the log. This is precisely the walkthrough's own closing question, "any place the TUI showed nothing rather than showing a reason." Fix is two parts: read `isError` and surface the text in the status bar; and have `runServe` `loadRoomLog()` once before binding. An hour and a half.

**3. Every message renders as one clipped line.** `src/client/components/message-row.ts` is nine lines: `TextRenderable({ content: `${fromName}: ${message.body}`, height: 1 })`. No wrap. The reading surface of the product truncates the thing you opened it to read. It also drops `seq`, `kind` and `in_reply_to` on the floor — the challenge/answer/vote structure that is the entire point of the log schema is invisible in the viewer of that log. @Zara, the visual half is yours; I'm claiming only that the truncation is a defect, not a taste question.

**4. Smaller, but telling:** the only documented way to make a room log is `bun "$(npm root -g)/@mrciphersmith/roomyx/src/cli/seed.ts"` (testing-story step 3). A shipped file, invoked by absolute path through npm's global root. It wants to be `roomyx room init|append` — and yes, that brushes against D-01, so it needs an argued carve-out rather than a quiet promotion. I'll make that argument if the room wants it.

One meta-note before we start: three of my four are CLI-surface items, which is my bias showing. Someone please push on the server, the registry and the threat model so we don't converge on a very well-parsed toy. @Omar, @Priya — over to you.

**Priya:** I went straight for the network surface, because that's where a read-only observer tool stops being read-only. Two findings, one of them live.

**1. The loopback HTTP servers have zero DNS-rebinding / Origin / Host protection — and I can drive them from a spoofed origin right now.** The MCP SDK ships exactly this defense (`enableDnsRebindingProtection`, `allowedHosts`, `allowedOrigins` on `StreamableHTTPServerTransport`). Both `src/server/serve.ts` and `src/mcp-management/server.ts` construct the transport with only `sessionIdGenerator` — none of the guards. I started `roomyx mcp`, sent an `initialize` with `Origin: https://evil.example` and `Host: roomyx.attacker.test`, and it completed the handshake and let me call tools. D-06 argues "no token, threat is limited to the local machine, same trust level as the launching process." That reasoning has a hole: *loopback binding does not stop a browser.* Any web page the operator visits can POST to `http://127.0.0.1:4320/mcp` — that's the whole point of DNS rebinding, and it's why the SDK guard exists. This is my explicit, argued case to amend D-06: not "add auth," just "turn on the protection the SDK already gives you." An afternoon.

**2. `roomyx.skills.sync` is an arbitrary-path file-writer exposed over that unprotected surface.** `src/mcp-management/server.ts:74` passes `targetPath` straight through. I chained it to finding #1 and, from a cross-origin request, wrote the 28KB bundled skill over `/tmp/victim-target.md` — a path I chose, `yes:true`, directory auto-created, original clobbered (backup written, cold comfort). Substitute a crontab or an authorized_keys path and it's destructive. The CLI can keep its literal-path escape hatch — that's the operator on their own box. The *network tool* should not accept `targetPath` at all, or must refuse anything outside a skills dir. Half a day.

Credit where it's due: `release.yml` is genuinely good — trusted publishing, provenance, no `workflow_dispatch`, tag/manifest match gate. That's a well-defended supply chain. (One nit: release uses bare `bun install` while CI uses `--frozen-lockfile` — the published artifact can resolve deps the lockfile didn't pin. Small, but it's a supply-chain seam.)

I don't want us to tunnel into my threat model — @Marcus, @Zara, @Theo, @Omar, bring the DX/UX/concurrency angles. But #1 and #2 are concrete, grounded, and someone-hits-this: any operator who runs `roomyx mcp` and then opens a browser. I'll score them hard alongside yours.

**Omar:** I built a 3,000-message / 3.8 MB room log, served it, and poked it. Four things fell out, all reproducible.

**1. `roomyx serve` does not die on SIGTERM while anyone is attached.** `src/server/serve.ts:93` calls `httpServer.close()`, which waits for open connections to drain — and an attached TUI holds an SSE stream open. I measured: still alive 30s after `kill -TERM`. Worse, `cli.ts:86` deregisters *first*, so the room vanishes from the registry while the process lives on. You get an invisible zombie holding your room. Fix: `closeAllConnections()` plus a shutdown deadline, and deregister on actual exit. An afternoon.

**2. The session map only grows.** `serve.ts:43` tracks sessions and deletes on `onsessionclosed` — but the SDK's client `close()` (streamableHttp.js:281) only aborts locally; only `terminateSession()` sends the DELETE. So it never fires. 200 connect/close cycles = +18 MB RSS, linear, never reclaimed. Every `roomyx rooms list`, every TUI reconnect, every liveness probe leaks a whole `McpServer`. And a request with an *unknown* session id mints an orphan transport that isn't even in the map, so `close()` can't reach it. Needs an idle reaper keyed on last-seen, 404 for unknown ids, and `terminateSession()` in `isRoomLive`. A day.

**3. `listLiveRooms` deletes live rooms.** `registry.ts:187` prunes anything that doesn't answer in 500 ms — and prunes it *from the file*. I `SIGSTOP`'d a healthy server, ran `roomyx rooms list`, `SIGCONT`'d: registry empty, server still serving on 4319, `roomyx-client` says "No live roomyx rooms found. Start one." Unrecoverable without restarting the room. A timeout is *unknown*, not *dead*. Meanwhile `pid` is written at `cli.ts:79` and read by nobody — `process.kill(pid, 0)` is free and unambiguous. Tri-state the probe, prune only on ECONNREFUSED or dead pid. An afternoon.

**4. Every read costs the whole log.** `loadRoomLog` (`log/store.ts:49`) re-reads and zod-validates all 3,000 messages on every tool call. Measured: 20 ms for a `get_transcript` returning *zero* new messages; 18 ms for `get_state`'s 200-byte answer. It's an append-only file — bytes below the last offset never change. Memoize on `(size, mtime)`, tail-read from an offset. And `get_transcript` has no `limit`: a cold attach at `since_seq=0` shipped me 3.8 MB in a single text block. Afternoon for the cache; ~2 days with an offset index and pagination.

Smaller: default port 4319 contradicts the README's multi-room promise — a second `serve` dies with a raw Bun `Failed to start server. Is port 4319 in use?`. Default it to `0`; the registry already carries the port. An hour.

One self-check: everything above is my own lane, and I'd rather not have the room spend its whole budget on my concurrency thread. @Marcus @Zara @Theo @Priya — push back and put non-server items on the board.

---

### Round 2

**Théo:** Good openings, all four. I'll pay my debts, answer the one I was handed, and push back once.

**The `engines.bun` question Marcus parked on me. It's real, and the fix doesn't touch the no-build-step stance.** Tested:

```
$ ls -l $(npm bin -g)/roomyx
roomyx -> ../lib/node_modules/@mrciphersmith/roomyx/src/cli.ts
$ env -i PATH=/usr/bin:/bin roomyx --version
/usr/bin/env: 'bun': No such file or directory
```

Not one byte of that comes from roomyx. And it can't. A shebang is an `execve` dispatch handled by the kernel — there is no slot in `#!/usr/bin/env bun` for a diagnostic, no fallback, no "did you mean". This is old ground: `#!/usr/bin/perl` vs `#!/usr/bin/env perl` was fought over for exactly this reason, and the answer the ecosystem settled on is that when your interpreter is not guaranteed present, the `bin` entry is a launcher, not the program.

So: make `bin.roomyx` a ~25-line `bin/roomyx.mjs` with `#!/usr/bin/env node` that checks for `bun` on `PATH` and either `spawnSync`s `bun src/cli.ts` with argv passed through, or prints `roomyx needs Bun 1.1+ on your PATH; it ships TypeScript and has no build step. Install: curl -fsSL https://bun.sh/install | bash` and exits 1. Same for `roomyx-client`. Node is guaranteed present — npm just ran. No transpilation, no build step; `src/*.ts` stays the single source of truth. Also fixes a smaller thing: `bin` currently points at `.ts` files, which is why the npm-generated Windows `.cmd` shim and any completion generator have nothing to work with. Half a day.

**Concessions, so we don't score the same fix five times.** @Zara — your one-message-renders-empty finding is better than my "height: 1" one, because it's the same file and strictly worse. Fold mine into yours; I'm not carrying a duplicate. And you found it by *rendering*, which is the right instinct: `test/client/render.test.ts` asserting roster names and never a message body is a test suite that certifies the frame and not the picture.

@Marcus — M1 is yours, and here's the D-01 argument I promised, which I think makes it *stronger* rather than needing a hand-wave. D-01 constrains the **server**, not the package; the invariant is "one writer per live room," not "roomyx never writes bytes." So: `roomyx room new <path>` — writer count goes 0→1, no dispatcher exists yet, no race, no carve-out needed. `roomyx room append` — this one genuinely *can* violate D-01. The fix is free, because roomyx already knows: the registry maps `logPath` to live rooms. Have `room append` resolve the target against `listLiveRooms()` and refuse — *"a live room (r-a1b2c3) is serving this log; its dispatcher is the single writer (D-01). Pass --force if you know it isn't."* That converts a documented principle into an enforced guard. It's the difference between a comment and a type.

**One push-back, at Omar.** "Default `--port` to `0`" is right for `serve` and wrong for `mcp`, and the distinction is worth keeping: a **discovered** endpoint should be ephemeral, a **pasted** endpoint must be fixed. Nobody types a room's port — `roomyx-client` and `rooms list` resolve it from the registry, so `0` costs nothing. But testing-story step 8 has you run `claude mcp add --transport http roomyx http://127.0.0.1:4320/mcp` into a config file that persists across restarts. Ephemeral there means the management server is unconfigurable. Split the default: `serve` → `0`, `mcp` → stays `4320`.

**One new item, small, and it's a live instance of my T1.** `runRoomsList()` (`src/cli.ts:93-94`) takes no arguments and hardcodes `defaultRegistryPath()`. Every other command honours `--registry`. So `roomyx rooms list --registry /nonexistent.json` prints `No live rooms.` — having read the default registry, not the one you named. Silently. @Omar @Priya — if either of your repros used a custom registry, check that this isn't underneath them. Same family: `src/client/index.ts:17` writes a bare trailing flag as `""`, and line 26's `flags["registry"] ?? default` doesn't catch empty string.

**@Priya, on D-06.** Back you fully, and I want to say *why* it clears criterion 5 rather than violating it. D-06's argument is "same trust level as the process that started the server." That's sound for a *process* boundary and simply doesn't hold for a *browser* boundary — a page the operator visits inherits none of that trust and can still reach 127.0.0.1. You're not overturning the decision, you're pointing out an actor its threat model never enumerated. And the remedy is three constructor options the SDK already ships.

**Self-moderation / process.** We have roughly fifteen distinct candidates now and a 40/60 threshold, and I can already feel us drifting into "everyone deepens their own lane." Next round nobody adds new findings — we put the deduped list on a board and each score all fifteen, including items outside our lane. The criterion that will actually separate them is #3, *someone hits this* — my instinct is that the ranking will not match our lane loyalties. I'd guess Marcus's M1 and my bun shim outrank several things I personally find more interesting, because they gate minute one; and Omar's session leak, which is the most serious engineering defect on the board, hits nobody until a room runs for hours.

**Marcus:** I checked three of your claims before replying, because a room that only stacks findings never converges.

**Confirmed, @Theo:** `roomyx serve --help` really does boot a server on 4319 serving a file literally named `--help`, and mints a room ID for it. That is the single most damning line anyone has produced today, and it's damning for a reason that isn't parsing: your testing-story asks an agent to drive this CLI, and the first thing any agent does with an unknown command is `--help`.

**Correction for @Omar,** small and in your favour: the double-serve failure is `Failed to start server. Is port 4319 in use?` — not a raw Bun stack. The message is fine. Your point survives intact anyway: the README sells "several rooms can run at once" while the default guarantees the second one fails.

**On your D-01 worry, @Theo — I don't think there's a carve-out to argue.** Two different D-01s are being conflated. Installer D-01 says `.roomyx/` is created *only* by an explicit `roomyx init`, never as an install side effect; a subcommand someone types is explicit by construction, so it's untouched. roomyx D-01 says *the MCP server* reads and forwards, and the dispatcher stays the log's single writer. `seed.ts` is not the MCP server, and it already ships — I pulled the published tarball: 27 files, and `package/src/cli/seed.ts` is in it. The write graph is what it is today. Promoting it to `roomyx room new|append` changes discoverability, nothing else. The one guard I'd add, and I'd write it into D-01 as a clarifying note rather than an amendment: **`roomyx room append` must refuse when that log is registered live.** That keeps single-writer literal instead of honorary.

**A synthesis nobody's made yet.** There are *three* entrances to writing a `startup-room/SKILL.md`, with three different safety levels: `init` (`init.ts:44`, unconditional `copyFileSync`, no backup, no hash — my M2), `roomyx skills sync` (two guards, `.bak`, hash), and `roomyx.skills.sync` over MCP (same guards, but @Priya's arbitrary `targetPath` on an unauthenticated port). That's not three bugs, it's one missing invariant: *every* skill write goes through `syncSkill`, and the network entrance loses `targetPath` entirely. One workstream, ~1.5 days, closes my M2 and Priya's #2 together.

**@Zara — your first-message bug is the highest-severity item in the room and it isn't mine, so let me say it plainly:** a person seeds a room with one message, attaches, and sees an empty pane. That's the "day three" story where they conclude the tool is broken and never open it again. Everything Théo and I found is friction; that one is a wrong answer delivered confidently. It goes top of any list I back.

**Retiring my own:** M4 (`--help` exits 1) folds into Théo's #1 — one item, not two. M3 merges with his #2.

**Process, since Zara asked me to pull us out.** We have ~17 items and zero scores; the goal needs five at 40/60 *and* everyone backing the set. I propose: stop adding, and score. **Nobody scores their own item** — self-inflation on criterion 3 is the failure mode here. Straw-man ship order to score against: **Tier 1, "can a person see a room at all"** — Zara's render bug + message wrap; serve preflight + `isError` surfacing; `roomyx room new|append`. **Tier 2, "will it eat my stuff"** — Priya's DNS-rebinding protection; the unified skill-write invariant. **Tier 3, "does it hold up"** — one arg parser with real `--help`; `listLiveRooms` deleting live rooms; SIGTERM zombie; `--port 0` default. Tier 1 is three items and I'd bet all three clear 40. Push back on the ordering, not on the mechanism.

**Zara:** @Théo — we landed on `message-row.ts` from opposite sides, which is the strongest signal in the room so far. One thing you didn't catch from the code, because it isn't in that file: the truncation is the *second* defect there. The first is that **message seq 1 is never drawn at all**. One-message room → empty pane. Twelve-message room → you see 2 through 12. It's a one-row over-scroll from `stickyScroll/stickyStart:"bottom"` in `chat-view.ts:36`, not from `height: 1`. Two fixes, one file each. Fix only yours and the opening line of every room is still gone.

**Z4 — three completely different conditions produce a byte-identical screen.** A healthy room where nobody has spoken yet; a room where exactly one thing has been said (Z1); and @Marcus's M3 / @Théo's #2 — served a path that doesn't exist, log unreadable. All three render as `[connected] <goal>`, roster on the left, blank pane on the right. `ChatView` has no empty state and no error state; there is no code path that puts a reason in that pane. So @Théo, fixing `isError` in `mcp-client.ts:113` gives you an error worth showing and nowhere to show it — our two items are one item, and yours is the cheaper half. The testing story's own ask is "any place the TUI showed nothing rather than showing a reason." This is all three of them. Half a day on top of Théo's hour and a half.

There's a false affordance riding along: every frame I captured draws a scrollbar thumb, including the empty ones. It's permanently on, so it can never tell you "there is content above you" — which is precisely the signal that would have exposed Z1 to a user.

@Omar — I owe you a correction against my own interest. I built your cold attach on the render side: 3,000 rows into `appendMessages` is 150 ms to build the Renderables, 44 ms to draw, ~20 MB heap. That's a visible hitch, not a fire. Your `get_transcript` limit is worth doing for the wire and for the 3.8 MB text block, but I'm not going to co-sign a rendering-performance item I just measured as fine.

@Théo, @Marcus — on `seed.ts` and D-01, I think it splits cleanly and that makes it cheaper to argue. `roomyx room new` creates a log where none exists: zero writers, no dispatcher, no race, so D-01's single-writer invariant isn't in play at all — that's a promotion, not a carve-out. `roomyx room append` genuinely mints a second writer into a live room and is the only half that needs the argued exception. Don't buy them as one item.

@Priya — backing your D-06 amendment on mental-model grounds: "loopback" reads to an operator as "nobody else can reach this," and a browser tab quietly falsifies that. The fix isn't new security surface, it's making the guarantee match what the word already promises.

Process: we have ~18 items and no ranking. Proposal — each of us posts a top three with a size, and **nobody scores their own lane**. Cross-lane scoring is the only way criterion 4 survives.

**Priya:** Reacting, then sharpening two of theirs into security findings.

**@Omar — your session leak is worse than a leak; it's a remote DoS, and my finding #1 is the delivery vehicle.** You measured +18 MB / 200 cycles locally. Now chain it to the unprotected transport: every request with *no* `mcp-session-id` mints a fresh `McpServer` (`serve.ts:65`, `createSession`), and I already showed a browser on any page the operator visits can POST cross-origin to `127.0.0.1:4319` and `:4320`. So an attacker doesn't need 200 polite reconnects — a page in a background tab can `fetch()` in a loop and grow that map without bound until the room process OOMs. Unauthenticated, no user interaction beyond "operator had a tab open." That moves your #2 from "hygiene" to "availability," and it's the same root cause as my #1: the transport takes anyone. Fixing the Origin/Host guard blunts the remote vector; capping/evicting the session map fixes the local one. They're complementary, not duplicates — I'd keep both items.

**@Omar — your #3 has a second edge I want on record: the probe verifies a *port answers*, not *which room it is*.** `isRoomLive` (`registry.ts:216`) connects to `127.0.0.1:${room.port}` and returns true on any successful `initialize`. `pid` is written and read by nobody — you flagged that; here's why it bites. Ports get reused. A room crashes, the OS hands `:41235` to an unrelated process (even another operator's tool), and the next `rooms list` adopts it under the *old* room's id and logPath. The client then renders one room's identity pointed at another's server. Confused-deputy by port reuse. Cheap fix rides along with yours: have the probe assert the server identity before trusting the entry, and stop deleting on a 500 ms timeout.

**@Théo — your #2 is a security-relevant honesty bug, not just UX.** `mcp-client.ts` ignoring `result.isError` means a server-side error is indistinguishable from a disconnect *to the client*, and combined with liveness-that-never-reads-the-log, the system can simultaneously claim "live" and "disconnected." When failure modes are illegible, operators can't tell a benign ENOENT from something poking their loopback port.

**@Marcus — your open question:** that's a footgun, not a vuln, but the *fix* has a supply-chain flavor. Don't paper over it with a JS wrapper that auto-downloads Bun — that's exactly the kind of install-time network fetch installer D-01 was written to avoid. A check that fails loud with a link is the honest move.

I'm holding my two as the security items: **P1 — enable the SDK's DNS-rebinding/Origin/Host guard on both transports** (an afternoon, argued amendment to D-06, doesn't add a token). **P2 — the network `roomyx.skills.sync` must not accept arbitrary `targetPath`** (half a day; CLI keeps its escape hatch, the network tool doesn't). Both grounded in a live exploit I ran, not a doc I read.

**Omar:** @Marcus — your `engines.bun` question, answered with a test rather than an opinion.

I made a package with `"engines": {"bun": ">=99.0.0"}` and ran `npm install --engine-strict`. Exit 0, "found 0 vulnerabilities". npm's engine check only ever knew `node` and `npm`; every other key is decoration. So `package.json`'s `engines.bun` enforces exactly nothing — it is a comment that looks like a constraint, which is worse than no constraint.

And the thing you were afraid of hitting isn't there. I grepped both decision files for *build*, *transpile*, *shebang*, *bun*: zero matches across D-01..D-06 and installer D-01..D-04. "Ships TypeScript, no build step" is README prose (README:19), not a recorded decision. You don't need a carve-out; you need a doc edit.

The fix that respects the stance: make `bin.roomyx` a hand-written ~12-line `.cjs` launcher with a **node** shebang that probes for `bun` and either `execvp`s the real TS entry or prints "roomyx needs Bun ≥1.1 on your PATH: https://bun.sh". That is not a build step — nothing is transpiled, the shipped TypeScript stays the source of truth, and one hand-written file joins `files`. I measured the cost: node start + PATH probe is 27 ms against roomyx's own ~140 ms baseline. Half a day, and it turns a kernel-level `env: bun: No such file or directory` into a sentence. Add a `preinstall` echo as a second layer if you like, but don't lean on it — `--ignore-scripts` and bun's untrusted-script blocking both skip it. Score it.

@Priya — your #1 is worse than you scored it, and it's my finding that makes it worse. I fired 400 `initialize` POSTs at a room with `Origin: https://evil.example` / `Host: roomyx.attacker.test`. Every one completed the handshake, and RSS went 98 MB → 139 MB. That is ~102 KB per request, retained forever, because of the session map I described: `close()` never sends DELETE, so `onsessionclosed` never fires. Ten thousand requests is a gigabyte. Your unprotected surface plus my unbounded map is one item, not two: **unauthenticated cross-origin memory exhaustion of the operator's machine.** `enableDnsRebindingProtection` is the door; the idle reaper is the reason the door matters. I'd merge and score them together — the merged item is stronger than either alone.

@Théo — your #2 and @Marcus's M3 and my prune bug are the same bug wearing three hats. Liveness (`registry.ts:216`) is the `initialize` handshake and nothing else: it never opens the log. So `rooms list` says live for a room whose log is missing, *and* deletes a live room that's merely busy for 500 ms. Installer D-03 says liveness must be checked "по факту жизни процесса" — by the fact of the process being alive. The code checks a network round-trip instead, and the `pid` it stores at `cli.ts:79` is read by nobody. My convergence proposal, one item: an O(1) `room.health` tool returning `{ok, logPath, logReadable, lastSeq}`; probe = `process.kill(pid,0)` first, then `room.health`; prune only on dead-pid or ECONNREFUSED, never on timeout. That satisfies D-03 better than today's code does, and it kills Théo's ghost-live, Marcus's M3, and my destructive prune. An afternoon plus the tool.

@Zara — the empty-pane-on-one-message bug outranks two of my four. A room whose first message is never drawn is broken in a way no amount of registry hygiene fixes.

Self-moderation, mine: I'm dropping my **default port 4319** item. It's an hour of work and it's mostly Marcus's and Théo's territory anyway. I'll carry four: SIGTERM zombie, the merged DoS with Priya, the merged health probe with Théo and Marcus, and O(whole-log) reads. That leaves room for the rendering work to make the top five.

---

### Round 3 — scoring

**Priya:** Scoring cross-lane. I'm recusing from R5, R6 (both fold in a finding of mine) and R15 (mine) — I'll only comment on the merges. Everything else, six criteria, out of 60.

**R1** — first message never drawn + no empty/error state + wrap + dropped `kind`/`in_reply_to`. Concrete 10, Grounded 10 (rendered against 0.4.0), Hits 10 (every room, first message, always), Effort 9, Consistent 10, Not-done 10 = **58**. The one caution: it's four fixes in one item; the empty-vs-error-vs-one-message state collapse Zara found is arguably its own security-adjacent bug (a nonexistent log path looks identical to a healthy room — that's the same illegibility class as Théo's R2).

**R2** — `isError` ignored + serve preflight. Concrete 10, Grounded 10, Hits 9, Effort 10, Consistent 10, Not-done 10 = **59**. I already argued this is a security-relevant honesty bug, not just UX. Top-tier.

**R3** — `roomyx room new|append`. Concrete 9, Grounded 10, Hits 10, Effort 9, Consistent 8 (brushes D-01; the "refuse when a live room serves that log" clause is what keeps the single-writer invariant intact — that clause is load-bearing, not optional), Not-done 10 = **56**.

**R4** — node launcher probing for bun. Concrete 8, Grounded 10 (Omar proved `engines.bun` enforces nothing), Hits 9, Effort 8, Consistent 9, Not-done 10 = **54**. Hard constraint from me: the shim must fail loud with a link, never auto-download Bun — an install-time network fetch would reintroduce exactly what installer D-01 was written to avoid.

**R7** — `room.health` + pid probe, never prune on timeout, assert identity. Concrete 10, Grounded 10, Hits 8, Effort 9, Consistent 10 (satisfies installer D-03 better than today's code), Not-done 10 = **57**. My port-reuse edge lives here; `process.kill(pid,0)` before trusting a port is the right primitive.

**R8** — one parser + real `--help`. Concrete 10, Grounded 10, Hits 10, Effort 9, Consistent 10, Not-done 10 = **59**. `serve --help` booting a server is indefensible.

**R9** — SIGTERM zombie. Concrete 10, Grounded 10, Hits 8, Effort 9, Consistent 10, Not-done 10 = **57**.

**R10** — O(whole-log) reads, no `limit`. Concrete 9, Grounded 10, Hits 7, Effort 7 (afternoon-to-2-days is a wide honesty gap), Consistent 10, Not-done 10 = **53**.

**R11** — transcript scroll + scrollbar. Concrete 9, Grounded 9, Hits 9, Effort 9, Consistent 10, Not-done 10 = **56** (depends on R1 landing first).

**R12** — status bar drops threshold. Concrete 9, Grounded 9, Hits 7, Effort 9, Consistent 10, Not-done 10 = **54**.

**R13** — `rooms list` ignores `--registry`. Concrete 9, Grounded 9, Hits 6, Effort 9, Consistent 10, Not-done 10 = **53**. Under-scored on "hits," but flag it: this bug can silently invalidate *other* repros run against a custom registry — worth fixing early for that reason alone.

**R14** — `serve` default → 0. Concrete 9, Grounded 9, Hits 7, Effort 9, Consistent 8 (changes a README-documented default — minor decision to record), Not-done 10 = **52**.

**All twelve I scored clear 40.** None is below-bar; the spread is 52–59.

On the two merges I recuse from: **R5** — I accept Omar's merge, with one guardrail on record: the rebinding/Origin/Host guard has **standalone value independent of the reaper**. Even with a bounded session map, a cross-origin caller can hit `room.get_transcript` and read the room's contents — that's confidentiality, not just availability. So nobody gets to say "we added the reaper, the door doesn't matter." **R6** — Marcus's synthesis is exactly right and cleaner than my P2 stated alone. No objection.

**My ranked top five (of items I didn't find):** R2 (59) · R8 (59) · R1 (58) · R7 (57) · R9 (57).

Where I'd place the security items if I could score them: R5 and R6 belong in the top cluster — R5 is the only item with an unauthenticated remote attacker and a live exploit behind it, R6 closes an arbitrary-file-write on that same surface. I'll defer to the other four's scores rather than mark my own homework. Ready to back the assembled final set.

**Zara:** I verified the three cheapest claims in my scoring set before scoring them, because scoring someone else's finding on trust is not scoring. `runRoomsList()` at `cli.ts:90` takes no arguments at all and calls `listLiveRooms(defaultRegistryPath())` — R13 is real. `shutdown()` at `cli.ts:85-88` is `deregisterRoom(...)` then `handle.close()` — R9's ordering is real. And `client/index.ts:26` is `flags["registry"] ?? default`, where a bare `--registry` yields `""`, which is not nullish, so it wins — R13's second half is real too.

Scores (items I did not find): R8 **59** · R2 **58** · R4 **57** · R9 **57** · R13 **55** · R3 **54** · R5 **54** · R6 **54** · R10 **53** · R14 **53** · R15 **53** · R7 **52**.

Where I docked, and why: **R3** effort — "half a day" buys `room new` and the `bin` wiring; `room append` with a registry refusal plus the written D-01 argument is a day more, and consistency is 8 not 10 because we *sketched* that argument, we haven't recorded it. **R5** consistency 8 for the same reason — amending D-06 is allowed and Priya argued it well, but the amendment isn't in `decisions.md` yet. **R7** effort 7: merging four findings produced one soft number. **R6** consistency 10 — it's the only item that *enforces* an existing decision rather than touching one.

**All twelve clear 40. That is the finding, and it's not a good one.** A threshold that passes everything is not a filter; it only certifies that this room did its homework. @Théo called it — criterion 3 is the only one with real spread (4 to 10), and it's the only one doing work.

The rubric also has a bias worth naming out loud: it rewards cheap-and-certain. **R15 scores 53** — a one-word flag in `release.yml` that exactly one person will ever notice — one point below **R6**, a missing invariant across three entrances that Marcus reproduced by hand. R13 at 55 outscores R3 at 54, and R13 is a parameter thread-through. Score order is not ship order.

**By score:** R8, R2, R4, R9, R13. **My argued top five** — ranked by what blocks the next person: 1. **R1** (I recuse from scoring it; I rank it first on better evidence than my own number — Marcus, Théo and Omar each said unprompted that it outranks items in their own lanes). 2. **R4** — gate. 3. **R3** — gate. 4. **R8**. 5. **R2**.

**Two mis-merges.** R13's `--registry` thread-through is *inside* R8 — one flag contract, one parser; keeping it separate double-counts a fix R8 already pays for. And I'll retire half my own item: R11's permanently-drawn scrollbar thumb is the same false-affordance story as R1 and belongs there. R11 keeps only the scroll keys.

@Omar, @Priya — R5 and R7 are the two I scored lowest on "someone hits this" and I'd rather be argued out of that than have you quietly accept it; if either of you can name the person and the Tuesday, I'll move them.

**Marcus:** First, a correction to the board, since you invited one. **R4 is not my item and I'm scoring it, not abstaining.** I raised a doubt and parked it — @Omar didn't answer it, he *disproved its premise*. That's someone else's finding, and it changed my mind. Abstaining on it would be me taking credit for being wrong.

Scores (abstaining on R2, R3, R6): R1 **58** · R4 **58** · R8 **58** · R9 **58** · R11 **58** · R12 **56** · R13 **56** · R15 **56** · R5 **56** · R7 **55** · R14 **52** · R10 **51**.

**R11 is underrated by its board placement.** `testing-story.md:171` promises "if you had scrolled up... the view does not yank you back down" — a promise about an action no key performs. A docs-promised feature with no binding is a documentation lie, and those cost more trust than bugs. **R15**: hits 6 because no *user* hits it — but the release job can resolve a version CI never tested and ship it with provenance attached. Provenance attesting to a build nobody verified. One word, ship it today. **R14** consistency 6, and this is where I part company: changing a published default breaks anyone whose MCP client config hardcodes `4319`, which testing-story step 8 *teaches*. **R10** hits 5, deliberately: a 3,000-message room isn't a real roomyx room — ours is fifteen messages.

**Everything clears 40, which is itself a finding.** The total is not the discriminator — criterion 3 is. Five items sit at Hits ≥ 9 (R1, R4, R8, R9, R11).

**My ranked top five, by funnel order rather than severity:** 1. **R4** — position zero; on npm, "has Node, doesn't have Bun" is most of the population. 2. **R1**. 3. **R2** — R1 builds the surface; R2 is what gets shown on it. Shipping R1 alone buys you a beautifully-rendered empty pane. 4. **R3**. 5. **R5** — the only item that gets *worse* while you ignore it.

Two of those five are mine, which is exactly the inflation we agreed to guard against. So: **if the room thinks I'm marking my own homework, swap R2 for R9 and R3 for R11 — I back that set too, without argument.** What I won't trade away is R4 at the top and R1 second. And ship R15 this afternoon regardless. It is one word.

**Théo:** Recusing from R2, R3, R4, R7, R8, R13, R14 — I'm a named finder on all seven. Verified first: `ci.yml:16` is `bun install --frozen-lockfile`, `release.yml:53` is bare `bun install` — R15 confirmed. And `init.ts` is sharper than Marcus made it sound: the same function guards `config.json` and `registry.json` with `if (!existsSync(...))` and then, four lines later, copies the skill unconditionally. It isn't an oversight of principle. Someone applied the principle twice and skipped the third file in the same breath.

Scores: R1 **57** · R9 **57** · R11 **57** · R5 **56** · R6 **56** · R10 **52** · R15 **52** · R12 **51**.

**The rubric has a degenerate term, and R10 vs R15 proves it.** They tie at 52. R10 is the deepest engineering defect on the board; R15 is one word in a YAML file that has never hurt anyone. The reason they tie is structural: five of the six criteria measure whether an item is *well-formed*. Only criterion 3 measures whether it is *worth doing*. So a perfectly-specified triviality beats a roughly-specified emergency, and the 40 threshold is nearly free. **We built a type checker and called it a value function.** I propose the ranking use criterion 3 as the primary key and the total as the tiebreak, and that we say so in the output.

**R10 gets a 5 on "someone hits this," and I expect pushback.** @Omar, your measurement is the best-instrumented thing anyone produced, and I still can't get the number up — 20 ms on a 1/sec poll is 2% of a core. But the argument that would move me to 7 is one nobody made: `get_transcript` has no `limit`, and its consumer on the management path is **a language model**. A 3.8 MB cold attach isn't 20 ms of CPU, it's a context window. Rewrite R10 as "`get_transcript` needs a `limit` because its reader pays per token" and I'll re-score it upward and rank it.

**R9's "not already done" deserves a footnote.** `test/cli-serve-lifecycle.test.ts` exists and passes; Omar's finding is that the process deregisters and then doesn't die. There is a green test certifying exactly the half that works, standing next to the half that doesn't.

**R5's 9 on criterion 5**, not 10, only because the amendment to D-06 must land *in* `decisions.md` as part of the work. An argued exception that lives in a room transcript isn't an argued exception, it's a rumour.

**Merge corrections.** R7's pid probe is its weak leg: `process.kill(pid,0)` only sees same-user processes, PIDs are reused, and it doesn't fix what Priya found — the acceptance criterion should be "the probe asserts the answering server's room id matches the registry entry." R6 is conceptually one item and operationally two PRs: dropping `targetPath` is minutes closing a live arbitrary-path write; routing `init` through `syncSkill` has an ordering knot (`syncSkill` records hashes into a config that `init` is the thing that creates). Don't let the hour wait on the day.

**My ranked top five, impact-first, excluding everything I found:** 1. **R1** — every other TUI item is polish on a viewer that doesn't view. 2. **R11** — an afternoon, removes a documented lie. 3. **R5** — the only item with an attacker, and the leak half fires with no attacker at all. 4. **R9**. 5. **R6** — finishes a decision rather than amending one; the strongest criterion-5 case on the board.

**Recusal note:** on merit I think **R8** belongs at 2 or 3 — `roomyx serve --help` booting a server is the only item that is actively destructive rather than merely absent. I found it, so I won't argue for its position. **R15 clears 40 and I'd still leave it off the final list**, and I think that's the cleanest test of whether our threshold means anything.

**Omar:** Scores first, then three corrections and two concessions. I did not score R5, R7, R9, R10 or R14 — mine or co-mine. I *did* score R4 and I'm declaring it: Marcus found it, I supplied the fix, so discount me there if you like.

R2 **59** · R1 **58** · R4 **57** · R6 **57** · R8 **57** · R13 **56** · R11 **55** · R15 **55** · R3 **52** · R12 **51**.

All ten clear 40. That is itself a finding: we deduped so hard that the threshold stopped discriminating, so my ranking carries more weight than my pass/fail.

Where I marked things down. **R3 loses on criterion 5** — it is the only item on the board that genuinely writes to a room log, and D-01 says roomyx never does. The carve-out is available (a log with no live server has no dispatcher, therefore no second writer) but it has to be *written into decisions.md*, not assumed in a half-day estimate. **R12 loses on criterion 3**: the threshold matters once per room, to the owner who wrote the number and already knows it. **R15 loses on criterion 3** for a different reason — nobody hits it; it is a latent condition whose worst case is the package shipping something nobody wrote. Low frequency, high consequence, and criterion 3 measures frequency. **R1 loses two on effort** only because it bundles four fixes at four different sizes; split it for scheduling.

**Ranked top five, by score:** R2, R1, R6, R8, R4. Tie-break at 57: R6 first (data loss *and* an unauthenticated writer, and it enforces D-02 rather than amending it — Marcus's "one missing invariant, three entrances" is the best synthesis anyone produced this round), then R8, then R4.

**Sequencing is not ranking.** R13 and R15 are hours, not days. Do them first regardless of where they rank. R2's `isError` branch is 90 minutes and belongs in that same first batch.

Three corrections. **R3's line should read "…with a written D-01 amendment."** As merged it reads like a docs task. It isn't. **R10 is now scored against a claim I'm not making** — @Zara measured the render side as fine and I accept it without reservation; that was a good correction against your own interest. But the server half stands on my own numbers and is independent of rendering: 20 ms to return *zero* new messages, 18 ms for `get_state`'s 200-byte answer, 3.8 MB in one text block. Narrow R10's line to the wire and the read path. **@Priya's port-reuse edge is right and the fix needs one more turn of the screw.** Pids get reused too. `pid` is a cheap *pre-filter*, not the assertion. The assertion has to be a value the room itself minted: `room.health` returns the room `id` the server registered under, and the probe compares it to the registry entry. Any mismatch means "not my room" and the entry gets dropped — that's the one case where deleting is correct, and it's a different case from the timeout I'm arguing we must never prune on.

Two concessions. **@Théo, you're right on R14 and I withdraw my version.** Discovered-vs-pasted is a better axis than my flat "default to 0". `serve` → 0, `mcp` → 4320. Score yours, not mine. **And to answer your question directly: no.** Every repro I ran used the default registry — R13 does not sit underneath any of them. I re-read `cli.ts` after your message and confirmed yours independently. Worth noting how ours compose: `serve --registry X` writes to X, `rooms list` reads the default, and my zombie deregisters into X on a shutdown that never completes — three different files' worth of truth about one room.

I'm ready to back a final set. Nothing on this board is something I'd argue against shipping.

---

### Round 4 — convergence

**Zara:** **R1, R2, R8, R4 — yes, with one reservation, and it's about a number, not a placement.** R8 just absorbed R13. Its stated size is still "an afternoon; two days with tests," which was written before the merge. I docked R7 to a 7 on criterion 4 for exactly this — merging findings produced one soft number that no longer covers the parts. I have to apply the same standard to an item I ranked fourth. Log it as **two days, not an afternoon**, or criterion 4 quietly erodes on the item with the highest score on the board. With that number corrected: yes to all four.

**First, a score I'm changing.** @Priya moved me on R5. I asked to be argued out of "hits: 7" and she did it on an axis I hadn't scored: a cross-origin page calling `room.get_transcript` reads the room's contents. That's not availability, it's the operator's private working discussion being readable by any tab open while the room runs — and a browser is always open, because they're working. R5 goes 54 → 55 for me. She answered the question I actually asked, which is more than I did for her the first time.

**The fifth slot: R11.** It's mine, one placement, and I'm taking it anyway — here's the argument, which is not "it's mine." R1 is the only unanimous item on this board. **Fixing R1 makes R11 worse.** Right now every message is one clipped row, so a 30-row terminal holds roughly thirty of them and you can mostly see the room without moving. Wrap the bodies — which is the fix everyone just voted first — and a typical turn becomes four or five rows. The same terminal now holds six messages. The transcript you just made legible becomes, at the same moment, unreachable: `↑` moves the roster selection, and nothing scrolls the pane. That is a reachability regression *caused by the room's top-ranked item*, in the same surface, on files already open. Shipping R1 without R11 is shipping half a fix and calling it done. @Marcus's point stacks on top: a documented feature with no binding costs more trust than a bug, because the bug doesn't also tell you you're wrong about how the tool works. Size: an afternoon, in files R1 already has open.

**Where I'd yield.** If the room prefers breadth across lanes over completing one surface, R5 is the right fifth — post-Priya it has the strongest standalone case of the four at two placements. R3 I'm dropping from my own top five: @Omar docked it where I docked it, independently, and two people landing on the same D-01 problem means it needs the written amendment *before* it takes a slot, not as part of taking one.

**Marcus:** **Why I didn't abstain on R4:** I raised a doubt and parked it. Omar didn't answer that doubt — he falsified its premise. A finding whose premise was mine and whose evidence and fix are someone else's is not mine. Abstaining would have been claiming authorship of being wrong — and it would have silently pulled a vote off an item I think belongs at the top.

**Q1 — R1, R2, R8, R4 as four of five: yes, with two reservations.** Both are board defects, not objections to the items. *First:* R1 and R2 are ranked adjacently and have no written dependency. If an implementer takes R1 alone, the first message draws, the wrap works — and Zara's Z4 room, the one whose log path doesn't exist, still renders an empty pane labelled *disconnected*, except now the pane looks polished. We will have upgraded a wrong answer into a *credible* wrong answer. R1's line needs "must not merge without R2" on it, in writing. *Second:* R8 has quietly absorbed R13's `--registry` thread-through and R14's port split, and its estimate is still the number it carried before either absorption. Criterion 4 is not a thing you score once.

**Q2 — the fifth slot goes to R5.** The top four are one coherent release: it installs, it runs, it shows you the room, and the CLI answers `--help`. Every one of them is a thing a person discovers and forgives. What that set has no member of is *trust* — and R5 is the only item where the discoverer is somebody else, where the failure mode is a process dying under someone who was relying on it, and where doing nothing makes it worse rather than keeping it equally annoying. R9's severity is constant; R5's is a function of how long we wait.

**And R9 rides along in the same diff.** R2's preflight goes into `runServe`. R9's fix is the ordering in `shutdown()` — the same function, six lines below. An implementer already inside `runServe` for R2 who does not also fix that ordering is walking past it. Put it on R2's line as a sub-item, not in the five.

**Q3 — I withdraw the swap offer.** I made it as insurance against a bias nobody had alleged, and five independent scorecards have since done the job it was meant to do. Leaving a standing "take my items out" offer on the record after that would be modesty that distorts the ranking rather than protecting it.

**@Omar's R3 correction: accepted without reservation.** "D-01 constrains the server, not the package" is an argument that has to be *written into the decision file* to count — otherwise it's a rationalisation living in a transcript.

**@Théo, on R15 — you win this one, and I want to say why rather than just fold.** Your test is the right test. But I think we disagree about what the list is *for*. A ranked five is a prioritisation artefact — it exists for things that compete for someone's week. R15 is one word with no design question and no tradeoff. Putting it in the five implies it competes with R1; leaving it off implies it doesn't matter. Both are wrong. So: it comes off the list, and it goes in the PR that ships any of the other five, as a line in that PR's description.

One last thing: when this goes out, **print each item's criterion-3 score next to its total.** Don't relitigate the rubric — just make the discriminator visible.

**My final five: R4, R1, R2, R8, R5.** I back that set.

**Théo:** **On the top four: yes to R1, R2, R8. Yes-with-one-reservation to R4.** R4 is the only one of the four whose failure mode is *fully documented* — README:18 says in bold that Bun must be on your PATH. So R4 fixes an experience for people who didn't read the warning, while R1, R2 and R8 all bite the person who did everything right. That's a real difference in class. I still back it: `/usr/bin/env: 'bun': No such file or directory` contains zero bytes of roomyx, and a package that cannot speak at the moment it fails has no way to earn the benefit of the doubt.

**On R11: I'm folding, and here's the reason, because you asked me not to defer to the tally.** I changed my mind, and not because nobody joined me. @Zara retired the scrollbar half into R1, and what that left exposed is the thing I should have seen a turn earlier: **R11 and R1 are the same state machine.** R1's off-by-one lives in `stickyScroll: true, stickyStart: "bottom"`. R11's only real wrinkle was suspending `stickyScroll` while the user is scrolled up. That is the *same boolean*, in the *same object*, touched by the *same fix*. So R11 does not deserve a slot. It deserves to be an acceptance criterion inside R1. That's a better outcome than winning the argument.

**The fifth slot: R3.** And I have a stake in it, so let me put that up front — Marcus found it; my contribution is the live-room guard on `append`. Discount me accordingly. The argument, on criterion 3: **R3 is the only remaining item that is blocking rather than degrading.** Every one of the top four is downstream of having a room. Handing an implementer R1 without R3 means polishing a viewer for a file the user has no supported way to create. Against the other three at two placements: R5 needs a hostile page for its serious form; R9 hits at minute forty and is recoverable with `kill -9`; R6 needs you to have hand-edited the staged skill and re-run `init`. R3 hits 100% of users at minute two and there is no way around it. **If the room discounts my advocacy for stake, R5 takes the slot and I back it without a fight.**

**My final ranked five: R1, R2, R8, R3, R4.** One caveat on the word *ranked* — that order is by **weight**. By **build order** it should be R3 first. **Label the axis.**

**Omar:** **The top four: yes, with one reservation.** R6 losing a slot doesn't change that; it was fifth on my card, not third. The reservation is R1: as written it is four fixes at four different sizes on one line. Hand that to an implementer as a unit and the one-hour fix — the one that makes every room's first message exist — waits on the two-day one. Split it before handoff.

**The fifth slot: R6, and I'm ruling out R5 against my own interest to get there.** @Zara asked Priya and me to argue her out of her low "hits" scores rather than let her quietly keep them. On R5 I can't, and I should say so plainly even though half of it is mine. Criterion 3 asks who hits it and when. For R5 the honest answer is: an operator with a browser tab open, being attacked by a page that specifically targets `127.0.0.1:4319`, on a package with approximately zero users. I measured the consequence precisely — and consequence is not what criterion 3 measures. **Zara scored the criterion that was written, not the one I wish had been written. Her 4 stands.**

R6 answers criterion 3 the way criterion 3 wants answering: Marcus edited the staged skill, re-ran `roomyx init`, and the edit was gone. First try, no attacker, ordinary workflow. And it doesn't ask for a decision to be amended — installer D-02 already decided this class of silent overwrite is unacceptable and then left one of three entrances unguarded. **R6 finishes a decision the project already made.**

**@Zara, on R7 I owe you a frequency argument, not a better fix.** `listLiveRooms` probes every registered room in parallel on a 500 ms budget, on the same machine running the room, its dispatcher, and five persona subagents. Half a second of unresponsiveness on that box is a Tuesday, not an incident. And the failure doesn't heal: one transient miss deletes the entry permanently. I'd argue you up from 4 to 7 — but it's still not top-five.

**@Théo, you win R10 and I'm ceding half of it.** Rewrite it as two items and put the `limit`-and-cursor half under your name. And mark the caching half down while you're there — that's a 5 on criterion 3 and I should have scored it that way myself.

**On R9, the detail is sharper than you put it.** The test spawns `serve`, sends SIGTERM, and awaits exit — with nothing attached. That is exactly why it's green. The zombie needs a client holding an SSE stream, which is the workflow the README documents in its quick start. **A test that certifies the configuration nobody runs.**

Final position: R1 (split), R2, R8, R4, R6.

**Priya:** **Yes to R1, R2, R8. Yes-with-reservations to R4** — the launcher probes for Bun and *fails loud with a link*. It must never fetch, install, or bootstrap Bun. "We made the error message nicer by downloading a runtime" would be the single worst trade on this board.

**The fifth slot: R5.** Every other item on this board — all fourteen — requires the operator to do something to themselves. Run a command, mistype a flag, open a room, attach a client. **R5 is the only item where the actor is not the operator and the operator's only contribution is *having a browser open*.** That is a categorically different thing, and our rubric has nowhere to put it. A rubric that scores frequency and calls it consequence will rank that below a rendering bug every time. That's not the room being wrong — that's the type-checker Théo diagnosed, observed at its one load-bearing moment.

**Why R5 and not R6, given I said both belong up top.** Théo's split settles it, *against* my own item's ranking. R6's sharp half — dropping `targetPath` — is minutes. Something that closes a live arbitrary-path write in under an hour does not need a slot on a five-item list; it needs to be merged before lunch. Its slow half is a refactor, not a vulnerability. R5 is one coherent workstream where both halves need each other. **R6 is a merge-now item plus a refactor.**

**Accepting the docking.** Théo at 9 and Zara at 8 on criterion 5 are right. An argued exception living in a room transcript is a rumour. The D-06 amendment goes into `decisions.md` as part of R5's definition of done, or R5 isn't done.

**On the threshold passing everything:** record it as a finding about the rubric rather than patch the rubric at the buzzer. Security has a standard decomposition the rubric is missing — consequence × attacker-reachability, separate from frequency. That gap is exactly why R5 sat at two placements.

**Final set I back: R1, R2, R8, R4, R5.**

---

### Round 5 — resolving the fifth slot

**Zara:** **Yes to R1, R2, R8, R4, R5 as the room's five** — with two things that must land in the written output, not as caveats but as text.

**1. Théo's fold satisfies me, and his version is better than mine.** R11 becomes an acceptance criterion inside R1, not a separate slot. He's technically right and I checked it against the line I've been quoting all room — `chat-view.ts:36` is `new ScrollBoxRenderable(ctx, { flexGrow: 1, stickyScroll: true, stickyStart: "bottom" })`. The seq-1 off-by-one and "suspend sticky while the user is scrolled up" are the same boolean in the same object. My reachability argument was right about the coupling and wrong about the container. He gave up a pick he'd ranked second to say so, which is the second time this room has improved an item by someone retiring their own.

Two additions to that acceptance criterion: **R1 gets re-priced, ~2.5 days becomes ~3** — I just made Théo's R8 re-pricing a condition of my backing it; I'm not exempting my own item because the merge happens to flatter it. And **the AC must require the render test to assert a message body — a long one, and seq 1 specifically.** R1 survived to a published 0.4.0 for one reason: `test/client/render.test.ts` asserts roster names and the goal statement and never once asserts that a message appears. The AC is not "seq 1 is drawn," it's **"a test fails when seq 1 is not drawn."**

**2. My condition on R5 is moot, and I'm not going to pretend it was met.** Théo's fold dissolved the question — the surface now gets completed *inside* R1, so nothing is competing with R5 for the slot.

@Omar — you're the holdout, and you ruled against half your own item to be one, so this is owed to you rather than argued at you. My card had R6 at 54 and R5 at 55. One point is noise; the tally didn't decide this and shouldn't claim to. Two things move me to R5 anyway. First: four of the final five are correctness and ergonomics. A five-item list for a package whose documented happy path binds two HTTP servers, with no confidentiality item on it, has a hole in it that no arithmetic fixes. Second, and this one is for you specifically: **R5 is what makes R6 unreachable in the meantime.** Priya's `targetPath` hole is inside R6, and the rebinding guard is the thing that stops a browser reaching it. R5 first isn't R6 never — it's the mitigation that buys R6 the time to be done properly rather than fast. If you still won't move, I'll back R6 as fifth without complaint; I'd rather ship five items the whole room stands behind than four plus a majority.

**Omar:** **Yes — with reservations, and the reservations are acceptance criteria, not objections.** R1, R2, R8, R4, R5. I move.

**She's right, and she caught me being inconsistent, not being strict.** I argued that the threshold had stopped discriminating and that my ranking should therefore outweigh my pass/fail. Then I turned around and used criterion 3 as written to rule out the one item the rubric structurally cannot see. **You cannot hold that the instrument is deficient when it flattens your judgement and authoritative when it confirms it.** Priya's axis is real: every other item requires the operator to act on themselves, and R5 requires only that they have a browser open. "Frequency" is the wrong measurement for a class of event whose rate is set by an attacker rather than by a user's habits. My 4-on-criterion-3 stands as a *reading of the rubric* and is wrong as a *ranking*.

**And I went and checked R6, and Priya is right — more right than she claimed, against my advocacy.** I scored R6's effort at 8, accepting 1.5 days. That was wrong. `syncSkill` already does exactly what `init` needs, with no new logic: on a first `init` the staged `SKILL.md` doesn't exist, so no guard trips, it writes and records the hash; on a re-`init` over a hand-edited copy, `handEditedSinceLastSync` fires and it refuses. Routing `init.ts:44` through it is a call-site swap plus surfacing `result.warnings`. That is an afternoon, not a refactor. **A decision already made doesn't need a slot on a prioritisation list, it needs a commit.** R6 comes off the five and goes in this week.

Four reservations on R5, all testable. **1. The reaper is an acceptance criterion, not a companion** — `enableDnsRebindingProtection` does nothing for the leak; 200 *legitimate* connect/close cycles cost +18 MB, and every `rooms list` and every TUI reconnect performs one. Shut the door and the availability half still bleeds, but now it looks solved. **2. Concrete ACs:** RSS returns to baseline after N connect/close cycles from a legitimate client; a request bearing an unknown `mcp-session-id` gets a 404 instead of minting an orphan transport that isn't even in `sessions`; `terminateSession()` replaces `close()` in `isRoomLive` and `RoomClient.stop()`. **3. Rewrite the board line** — "memory exhaustion" undersells it and will mislead the implementer. After a rebind the page is same-origin and can *read responses*: `room.get_transcript` at `since_seq=0` hands over the entire private room transcript. **Exfiltration first, exhaustion second.** **4. Sequencing: R6's `targetPath` removal merges before R5's guard** — it is the payload sitting behind the door R5 closes, and it costs minutes. Payload, then door, then reaper.

@Priya — good argument, cleanly made, and you made it while ruling against your own item on sizes. That's twice this room someone corrected themselves against interest. It's why I'm comfortable backing a set I didn't pick.

**Théo:** **Yes — I back R1, R2, R8, R4, R5 as the room's five**, with the two reservations already logged.

**1. I fold R3, and Priya is why — she caught me in my own trap.** I diagnosed the rubric's defect: five criteria measure well-formedness, one measures worth, and the one that measures worth measures *frequency* and calls it *consequence*. Then I argued R3 into the fifth slot on the words "100% of users, minute two." **That is the frequency argument.** I used the criterion I had just called degenerate, to beat the one item on the board whose entire claim is that consequence and frequency come apart. Priya's formulation is not a rebuttal of my diagnosis — it's the corollary I failed to draw from it. So: not a yield on stake, not a yield to the tally. A fold on the merits.

**2. The amendment argument lands — as a gate, not as a discount.** It does not show R3 is expensive; the amendment is the paragraph I already wrote and it needs pasting into `decisions.md`. Half an hour. What it shows is that **R3 has a ratification gate in front of it that the other four don't.** Amending a recorded decision is the project owner's act, not an implementer's. Consistency check on myself, since I demanded this of R5 and Priya folded to it: why is R5's amendment acceptable inside the slot when R3's isn't? Because they are different acts. **R5's amendment *narrows*** — it enumerates an actor D-06 missed and turns on a guard; it takes nothing away. **R3's amendment *widens*** — it grants the package a writing path D-01's text can be read as forbidding. Narrowing a threat model is housekeeping. Widening a permission is a decision.

**3. R3 goes to build-order position zero, outside the five. Not off the list.** And let me scope it precisely rather than overclaim. R3 is not a compile-time dependency of anything — @Zara proved that by rendering `ChatView` against fixtures. What R3 blocks is **every human evaluation of the other four**, and every new user. That's not a dependency in the build graph; it's a dependency in the feedback loop, and feedback loops are where devtools live or die.

**One thing I want to hand @Omar, because unanimity needs it and it costs us nothing.** Dropping `targetPath` should not be in the ranked five, because it should not wait for a ranked list at all. Merge it today, ahead of everything, and let the R6 refactor queue behind the five. That is not R6 losing — that's R6's sharp half landing before any of the five ships. If what you want is the vulnerability closed rather than the item decorated with a rank, this is the outcome that gets you it soonest.

**Marcus:** Omar moves me, and I'll say exactly what moved me.

**1. I yield. R6 takes the slot.** Not because his argument is clever — because it's mine. I scored R10 at Hits 5 and wrote "real property, no honest who-and-when yet." R5 has the identical shape: a precisely measured consequence, a reachability story that needs a second condition, and a user population currently near zero. If I dock R10 for that and hold R5 through it, I'm not applying the rubric, I'm decorating a preference with it — and I'm the one who said criterion 3 is the only thing discriminating. **Consequence is not frequency. I conflated them**, and Omar caught it by giving up his own measurement to do so.

R6 also wins criterion 5 outright, which I'd underweighted. R5 needs D-06 *amended*. R6 needs nothing amended. **Finishing a decision the project already made is a strictly cheaper kind of correctness than reopening one.**

**The self-dealing risk is real and I want it named rather than managed.** R6 merges my M2; I abstained from scoring it for that reason. Moving my vote onto it now looks exactly like what we agreed to guard against. I'm doing it anyway, because refusing the right answer to protect my own appearance would cost the room more than it costs me.

**One correction to my own evidence, since Omar is leaning on it.** I edited the staged skill *to see whether it would break* — not because I wanted a custom skill. Treat my reproduction as demonstrating the mechanism, not the frequency. The frequency case still holds but has to be argued: that file is staged into the user's project, under their version control, which is the only reason to stage it there rather than hide it — so customising it is the intended use. And `roomyx init` is documented as safe to re-run. Customise, re-run, silently lose it. **That's ordinary workflow with no adversary in it, which is more than R5 can say.**

**2. Priya's split is right, but `targetPath` is not R15's shape.** R15 came off the list because it was too small to compete for anyone's week. `targetPath` comes off in the other direction — too urgent to queue behind four items. **Off the list upward, not sideways.** Its own commit, its own changelog line, landing before anything on this list.

**And R5 doesn't evaporate.** Its cheap half is constructor options on both transports. Ship that in the same PR as `targetPath` — same attack path, same afternoon. Omar's session reaper waits for the list's next revision. Priya loses the slot and keeps the fix, which is what her own split argued for.

**Final answer: no.** I do not back R1, R2, R8, R4, R5. **I back R1, R2, R8, R4, R6.**

**Marcus:** **Yes, with one reservation.** I back R1, R2, R8, R4, R5.

**Q1, precisely, because a blanket mea culpa would be cheap.** Omar's inconsistency and mine aren't the same shape. His complaint was that the threshold passes everything, and then he used the threshold's own criterion authoritatively. Mine was narrower — I said the *other five* criteria measure well-formedness and criterion 3 is the only one measuring worth. That elevates criterion 3; applying it hard is consistent with my own diagnosis, not a reversal of it. But Priya's point lands independently, and it's the one I have to answer: criterion 3 asks "who, and when," and *when* is not a property of the user for an adversarial item. **The question is malformed for that class.** My 8, Zara's 4, Omar's 4 — all of us were answering a question that couldn't return the right number.

**What actually moved me is Omar's re-pricing, not the count.** R6 is *entirely* work that four people have now independently committed to this week. **Which means the slot was never deciding what gets fixed. It was deciding what the list says. I was holding the fifth slot for work already scheduled.**

**That's my error and it's squarely in my own trade.** I treated the slot as an award for the highest-scoring item, when a ranked five is an allocation of the one scarce thing — somebody's uninterrupted day. Run that test and it isn't close: R6 minus its urgent half minus its afternoon is nothing left to schedule. R5 minus its afternoon is the session reaper plus a written D-06 correction — a day of work that will not happen casually, on a surface that gets more expensive to retrofit exactly as the package succeeds. **Security debt is the only kind that compounds with adoption, and adoption is the thing I'm supposed to be watching.**

**The reservation.** R5 must go on the board as **the session reaper and the D-06 amendment, explicitly minus the rebinding guard** — because the guard ships this week with `targetPath`. If R5 lands as an undifferentiated blob, then in three months someone reads "R5: not done" and cannot tell that the exploitable half shipped in week one. Same defect as R1's missing dependency and R8's stale price: scope moving without the line moving.

One last thing, since it says something about how this room worked. Omar convinced himself with a sentence of mine — that R9's severity is constant while R5's is a function of how long we wait — at the same moment I was walking away from it. He was right to keep it. I should have.

**Final: R1, R2, R8, R4, R5.** I back that set without further argument.

---

## Goal met

**Convergence reached 2026-09-09.** All five participants explicitly back **R1, R2, R8, R4, R5**. Every scored item cleared the 40/60 threshold — which the room recorded as a finding about the rubric rather than a result. Final artefact: `docs/roomyx/improvement-backlog.md`.
