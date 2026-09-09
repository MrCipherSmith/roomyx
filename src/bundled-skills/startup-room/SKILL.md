---
name: startup-room
description: Run a startup-room session with a live, attachable roomyx view. Use when starting, resuming, or observing a multi-persona room and you want the owner to be able to watch it in a terminal UI rather than only through the transcript.
---

# startup-room — roomyx integration

**Scope.** This is roomyx's own contribution to the `startup-room` skill: the
steps that make a room observable while it runs. It is not the startup-room
methodology itself — persona design, the goal contract, scoring, convergence
and the rest live in the skill this text is meant to join.

**How it lands matters.** `roomyx skills sync` copies this file over the
target; it does not merge into it. If you already maintain a fuller
`startup-room` skill, treat this as text to fold into your Setup/Kickoff
section by hand, not as a file to overwrite it with. roomyx backs up whatever
it replaces to `<target>.bak-<timestamp>` and refuses to write at all without
`--yes`, but a backup is a way to recover from the wrong move, not a reason to
make it.

## At kickoff: start a room server

If roomyx is available for this project — a `.roomyx/` directory exists, or the
`roomyx` command resolves on `PATH` — start a server for the room's log as part
of kickoff:

```bash
roomyx serve <logPath> --port 0
```

`--port 0` takes an ephemeral port, so several rooms can run at once without
colliding. The command prints the bound URL and a short room ID:

```
roomyx serving /abs/path/room.jsonl at http://127.0.0.1:41235/mcp
room ID: r-a1b2c3 — attach with `roomyx-client --room r-a1b2c3`
```

Relay that room ID to the owner in the kickoff confirmation, together with the
attach command. That is the whole point of starting the server: the owner can
open the room in a terminal and watch it live instead of waiting for a summary.

If roomyx is not available, proceed exactly as you would otherwise. This step
is additive — a startup-room session has never required roomyx and still
doesn't.

## While the room runs

- The server is **read-only**. It never writes to the room log; the dispatcher
  remains the log's single writer. Attaching, detaching, or closing the TUI has
  no effect on the room.
- The owner attaches with `roomyx-client --room <id>`, or with a bare
  `roomyx-client` when only one room is live. `roomyx rooms list` shows what is
  actually running — each entry is confirmed with a real call, not just read
  out of the registry file.
- Owner commands (veto, constraint, add participant, edit goal) reach the
  dispatcher through `room.post_owner_command`. A server started by bare
  `roomyx serve` has no dispatcher attached and will say so rather than
  silently swallow a command; an orchestrator that embeds the server handles
  them itself.

## At shutdown

Stop the server with `SIGINT`/`SIGTERM` — it removes its own registry entry on
the way out. A server killed outright leaves a stale entry behind, which is
harmless: the next `rooms list` or attach checks liveness and prunes it.
