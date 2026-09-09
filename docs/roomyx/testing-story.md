# Testing roomyx end to end, with keryx shell

A walkthrough from `npm install` to driving a live room. Every command here was
run against the published package before this was written; the outputs shown
are real, only paths are shortened.

Budget about fifteen minutes. You need two terminals — one for the room, one
for the view.

## Read this first: what keryx shell can and cannot do

**keryx shell cannot attach roomyx's MCP server.** Two independent reasons:

- `keryx mcp` is keryx *publishing itself* over MCP (`keryx mcp serve`) and
  installing that entry into other runtimes' configs (`keryx mcp install`). It
  is not a way to add a third-party server to keryx.
- The MCP client keryx does have (`src/mcp-client/`) speaks stdio to
  `codex mcp-server` and has no HTTP transport at all. roomyx serves
  StreamableHTTP over loopback.

This is not a gap that appeared by accident — roomyx's own `decisions.md` D-04
records it, and it is why roomyx never depended on keryx's client.

So in this walkthrough keryx shell drives roomyx **through its CLI**: you ask
the agent in the shell to run `roomyx` commands, and it does. That is a real
integration and it is step 6. The MCP surface is exercised from Claude Code in
step 8, which *is* an MCP client.

## 0. Prerequisites

```bash
bun --version      # 1.1 or newer — roomyx ships TypeScript, Bun executes it
node --version     # 22+ for npm
keryx --version    # only needed for step 6
```

If Bun is missing, everything below installs fine and nothing runs: both
binaries carry a `#!/usr/bin/env bun` shebang.

## 1. Install

```bash
npm install -g @mrciphersmith/roomyx
roomyx --version
```

```
0.4.0
```

Two binaries land: `roomyx` and `roomyx-client`.

```bash
roomyx
```

```
Usage: roomyx <init|serve <logPath>|client|mcp|rooms list|skills sync --target <claude|codex|keryx|all|path>>
The terminal UI is also a separate binary: roomyx-client [--room <id>]
```

## 2. Scaffold a project

```bash
mkdir -p /tmp/roomyx-trial && cd /tmp/roomyx-trial
roomyx init
```

```
Created /tmp/roomyx-trial/.roomyx
```

```bash
find .roomyx -type f
```

```
.roomyx/config.json
.roomyx/rooms/registry.json
.roomyx/skills/startup-room/SKILL.md
```

Nothing was created outside this directory, and `init` never overwrites a
registry that already has rooms in it.

**Check the un-initialized path too**, since it is the one people hit first:

```bash
cd /tmp && roomyx rooms list
```

```
No live rooms.
```

Not an error, not a stack trace — there is simply nothing there. Go back:
`cd /tmp/roomyx-trial`.

## 3. Make a room log

A room log is JSONL: one `state` line, then `message` lines. The package ships
a seeding helper for exactly this:

```bash
SEED="$(npm root -g)/@mrciphersmith/roomyx/src/cli/seed.ts"
bun "$SEED" init room.jsonl \
  --goal "Pick a database for the trial service" \
  --roster yuki:Юки,omar:Omar
```

```
Initialized room.jsonl with 2 roster entries.
```

```bash
bun "$SEED" append room.jsonl --from yuki --body "Postgres. Boring on purpose."
bun "$SEED" append room.jsonl --from omar --body "Boring is the requirement." --kind challenge --in-reply-to 1
```

## 4. Serve the room

```bash
roomyx serve room.jsonl --port 0
```

```
roomyx serving /tmp/roomyx-trial/room.jsonl at http://127.0.0.1:41235/mcp
room ID: r-a1b2c3 — attach with `roomyx-client --room r-a1b2c3`
```

Two things worth noticing. `--port 0` took an ephemeral port, so several rooms
can run at once. And the path printed back is absolute even though you passed a
relative one — the registry outlives this shell's working directory.

Leave it running. In a second terminal:

```bash
cd /tmp/roomyx-trial && roomyx rooms list
```

```
r-a1b2c3  port=41235  log=/tmp/roomyx-trial/room.jsonl  started=2026-09-09T...
```

That listing is not a file dump: each entry is confirmed with a real MCP call
before it is shown, and entries that don't answer are pruned.

## 5. Attach the terminal UI

Still in the second terminal:

```bash
roomyx-client
```

With exactly one live room it attaches without being told which. The roster is
on the left, messages on the right, the goal contract along the top.

- `↑`/`↓` move through the roster, `Enter` opens that participant's modal,
  `Esc` closes it.
- `q` or `Ctrl-C` quits. **The room does not care** — the server keeps running,
  and you can re-attach.

**Watch it update.** In a third terminal (or after detaching):

```bash
bun "$SEED" append room.jsonl --from yuki --body "Fine. Postgres it is."
```

The message appears in the attached client within about a second. If you had
scrolled up to read history, the view does not yank you back down.

## 6. Drive it from keryx shell

This is the integration that works today. Start the shell in the project:

```bash
cd /tmp/roomyx-trial && keryx shell
```

Then ask, in plain language:

> Run `roomyx rooms list` and tell me what's running.

> Append a message to room.jsonl from omar saying "then let's stop arguing",
> using the seed helper at `$(npm root -g)/@mrciphersmith/roomyx/src/cli/seed.ts`.

> Start a second room on a fresh log and tell me both room IDs.

What you are testing is that roomyx's CLI is legible to an agent driving it:
outputs are short, IDs are copyable, failures say what to do. If the agent has
to guess, that is a finding worth reporting.

With two rooms live, check the ambiguity path:

```bash
roomyx-client
```

```
Multiple live rooms found (r-a1b2c3, r-d4e5f6). Pick one with --room <id>.
```

## 7. Owner commands

Attach the client and press `o`. Pick `v`eto, `c`onstraint, `a`dd participant or
`g`oal edit, type a body, `Enter`.

Against a room served by bare `roomyx serve` you will get a refusal:

```
veto not accepted — No dispatcher is attached to this server, so there is
nothing to act on the command...
```

**That is the correct result, not a bug.** roomyx never writes to a room log —
the dispatcher running the room is its single writer. `room.post_owner_command`
forwards to a handler the dispatcher supplies when it embeds the server
(`onOwnerCommand` in `serve()`); with nobody dispatching, accepting the command
would be a lie. A real startup-room session, where the orchestrator embeds the
server, is where the command lands somewhere.

While the prompt is open it owns the keyboard, so a `q` typed into a veto is
text, not a quit. `Esc` cancels at any stage.

## 8. The management MCP server

This is the piece meant to be connected to an agent runtime. Start it:

```bash
roomyx mcp
```

```
roomyx mcp listening at http://127.0.0.1:4320/mcp
tools: roomyx.rooms.list, roomyx.skills.sync
```

Port `4320`, deliberately not `4319`, so it never collides with a room server.
Loopback only, unless you pass `--acknowledge-non-loopback`.

Connect it to Claude Code, which is an MCP client:

```bash
claude mcp add --transport http roomyx http://127.0.0.1:4320/mcp
```

Then, in a Claude Code session, ask it to list live rooms — it should call
`roomyx.rooms.list` and get back the same rooms `roomyx rooms list` shows.

For keryx, see the note at the top: use the CLI path in step 6 instead.

## 9. Skill sync, and the safety you want it to have

The interesting test here is the one that *refuses*.

```bash
roomyx skills sync --target all
```

```
claude: ~/.claude/skills/startup-room/SKILL.md
  warning: ... already exists but roomyx has never synced it before —
  refusing to overwrite unrecorded content without --yes.
  would write (pass --yes to apply)
codex: ~/.codex/skills/startup-room/SKILL.md
  would write (pass --yes to apply)
keryx: /tmp/roomyx-trial/.metaproject/project-skills/startup-room/SKILL.md
  would write (pass --yes to apply)
```

Nothing was written. Two separate guards did that: `--yes` is required for any
write at all, and on top of that roomyx refuses to overwrite content it has no
record of having written, even with `--yes`, until you say so again.

Verify it really didn't touch anything:

```bash
ls ~/.claude/skills/startup-room/          # unchanged, no .bak-* files
ls ~/.codex/skills/startup-room 2>/dev/null # still absent
```

To exercise the writing path, point it somewhere disposable:

```bash
roomyx skills sync --target /tmp/roomyx-trial/out/SKILL.md --yes
head -3 /tmp/roomyx-trial/out/SKILL.md
```

It creates the directory, writes, and records the hash. Run it a second time
and it backs the previous content up to `.bak-<timestamp>` first.

**Do not point `--target claude --yes` at a startup-room skill you maintain by
hand.** Sync copies over the target, it does not merge into it. The bundled
skill is a superset — the full methodology with roomyx's steps folded in — so
overwriting is survivable, and a backup is written either way, but folding the
roomyx section into your own copy by hand is the better move.

## 10. Teardown

```bash
# In each serve/mcp terminal: Ctrl-C. Then:
roomyx rooms list      # No live rooms.
rm -rf /tmp/roomyx-trial
claude mcp remove roomyx
npm uninstall -g @mrciphersmith/roomyx
```

A server stopped with `Ctrl-C` removes its own registry entry. One killed
outright leaves a stale entry, which is harmless — the next `rooms list` checks
liveness and prunes it. You can test that deliberately: `kill -9` a serve
process, then run `rooms list` and watch the entry disappear.

## What to report back

- Any command whose failure message left you guessing what to do next.
- Anything in step 6 where the keryx shell agent had to guess at roomyx's CLI.
- Any place the TUI showed nothing rather than showing a reason.
- Whether step 9's refusals felt clear enough to trust with a real skill file.
