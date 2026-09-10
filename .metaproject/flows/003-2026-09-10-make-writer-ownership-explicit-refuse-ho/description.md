# Make writer ownership explicit: refuse honestly, and replace --force with a take-over

Status: formalized. Gated by `docs/roomyx/decisions.md` **D-18**, items 1-4 and 7.
Source: the design discussion that produced D-16/D-17/D-18; this flow is the first
half of D-18, not all of it.

## Problem

The invariant D-18 exists to protect — one writer per live room — is currently
held by a **prompt**, not by the program. Three facts make that concrete:

1. The guard lives in the CLI and is message-shaped: `room append` refuses when
   the registry shows a room serving that path (`src/cli.ts:188-206`).
2. Its refusal admits it cannot tell the two cases apart: "If it has a
   dispatcher, that dispatcher is the log's single writer (D-01a) and appending
   here races it." The server **knows** the answer (`options.onOwnerCommand !==
   undefined`) and does not report it, so the CLI has to hedge.
3. The bundled skill — the documented workflow for the primary consumer —
   instructs the dispatcher to write through the guard's own escape hatch:
   `roomyx room append … --force`, with the words "**`--force` is required here,
   and it is correct here.**" (`src/bundled-skills/startup-room/SKILL.md:139,143`).

A guard whose documented happy path is the override guards nothing. The
consequence of getting it wrong is not cosmetic: the room log is append-only,
has no repair command, and `src/log/schema.ts` exists because a writer once
accepted a value its own reader refused and the room became unreadable forever.

## Expected Outcome

- The server tells the truth about whether anyone is dispatching into it.
- `room append` needs no override in the legitimate case (a bare `roomyx serve`
  has no writer to race), and cannot be overridden by accident in the dangerous
  one (a live room with a dispatcher and a fresh lease).
- `--force`, the flag that made the refusal optional, is gone; `--take-over`
  takes ownership only from a room that is dead or whose writer is provably gone,
  and leaves a record in the log when it does.
- The skill no longer teaches the override.
- A body containing quotes or newlines can be appended without the JSON
  assembly being done by whatever shell the dispatcher happens to be in.

## Out of Scope — deliberately, and not forgotten

- **D-18 item 5 (`room.get_delta_for`)** and **item 6 (the owner-command queue
  and `room.ack_owner_command`)**. Both change the MCP tool surface and deserve
  their own flow; item 6 is also the only one that can make owner commands
  actually reach a room.
- **D-18 item 8** (a representation for `goal_edit` / `add_participant`): the log
  format has no shape for it, and inventing one is a decision, not a task.
- Moving the write itself into the server. Rejected in D-18 on availability
  grounds — a dead `serve` would stop the room from recording anything at all.
  This flow keeps the CLI able to write, and makes *when* it may do so honest.

## Amendment to D-18 item 3, found while planning this

D-18 says the lease is held by "whoever writes: the CLI or an embedding
dispatcher". A one-shot CLI invocation cannot hold a lease — it exits, and a
lease written by a process that has already exited is expired by construction,
which is exactly the case a lease exists to distinguish. So the lease is held by
the **server, when a dispatcher is attached to it** (same process, same
lifetime), and a bare `roomyx serve` holds none. The one-shot CLI's writes are
serialized by the log's own lock (D-10) and need no lease. This narrows
`--take-over` to one real case — a live room whose dispatcher died or hung while
the server kept answering — which is the case it should be narrow for.
