# Watching the room live, with roomyx

How to create the log, serve it, append turns, read a participant's delta and
pick up owner commands.

Read this when roomyx is available — a `.roomyx/` directory exists, or `roomyx`
resolves on `PATH`. Without it, run the session exactly as you otherwise would;
nothing in the skill depends on roomyx being there.

## Contents

- Creating the log and starting the server
- Appending each turn
- Getting a participant's delta
- Owner commands: looking, and acknowledging
- Stopping, and where a closed room goes

A room's transcript is a file the owner can only read after the fact. roomyx
turns it into something they can watch while it runs, without changing how the
room works: it reads the log and serves it, and it never writes to it. The
dispatcher stays the log's single writer.

**The log must be roomyx's own format, not the markdown transcript.** roomyx
reads JSONL: one `state` header line, then one JSON line per message. A markdown
file is not readable by it, so create the log with `roomyx room new` and append
through `roomyx room append` — those two commands are the whole of it, and the
dispatcher is still the single writer. Use the markdown convention described
above only when roomyx is *not* available.

Create the room and start the server as part of setup, before the kickoff
spawns:

```bash
roomyx room new .roomyx/rooms/logs/<topic>.jsonl \
  --goal "<the goal statement>" \
  --criteria "<the threshold, in one line>" \
  --roster "ann:Ann,ben:Ben,cara:Cara"

roomyx serve .roomyx/rooms/logs/<topic>.jsonl --port 0
```

Then append each participant's turn verbatim as it arrives:

```bash
roomyx room append .roomyx/rooms/logs/<topic>.jsonl \
  --from ann --kind pitch --body "<their actual words>"
```

**No override flag, and that is the point.** `append` refuses only when the
room is live *and* something is writing into it — a live room with no dispatcher
has no writer to race, so this succeeds as written. The guard used to require
`--force` here because roomyx could not tell the two apart from outside; the
server now reports whether a dispatcher is attached, and the writer holds a
lease, so the case that needed an override no longer arises. If something else
really is writing (you will be told its pid), the only honest move is to stop it
— do not look for a flag that overrides a live writer, because there is none.

`--take-over` is for a room whose writer is **provably gone** — its server has
stopped, or the lease it left behind has expired without being refreshed. It
records the take-over in the log, naming whose lease it took. It does not
displace a writer that is still there: a room that reports a dispatcher attached
keeps refusing until that server is stopped, and the refusal will tell you so.
Use it when you know you are the last writer, never to get past a refusal you do
not understand.

`--kind` is one of `pitch`, `question`, `challenge`, `answer`, `vote`, `status`,
`research`; `--in-reply-to <seq>` records who was being answered. Both are
optional and both make the transcript far easier to read later.

`--port 0` takes an ephemeral port, so several rooms can run at once without
colliding. It prints the bound URL and a short room ID:

```
roomyx serving /abs/path/room.jsonl at http://127.0.0.1:41235/mcp
room ID: r-a1b2c3 — attach with `roomyx-client --room r-a1b2c3`
```

If `serve` refuses instead, read what it says: it now reads the log before
binding anything, so "must start with a valid state line" means the file is not
a roomyx log — most likely a markdown transcript. Create it with `room new`.

**Relay that room ID to the owner in the kickoff confirmation, with the attach
command.** That is the whole point of starting it — the owner opens the room in
a second terminal and watches the discussion as it happens instead of waiting
for your status reports. `roomyx rooms list` shows what is actually running;
each entry is confirmed with a real call, not just read out of the registry.

Attaching, detaching, or closing that terminal does nothing to the room. If the
owner never attaches, the session is unaffected.

Stop the server with `SIGINT`/`SIGTERM` when the room ends — it removes its own
registry entry on the way out. A server killed outright leaves a stale entry,
which is harmless: the next `rooms list` prunes it after a liveness check.

A closed room is not lost. It is recorded in `roomyx rooms history`, and the
owner can reread it at any time with `roomyx-client --archive`, so tell them the
room is in the history when you finish.
