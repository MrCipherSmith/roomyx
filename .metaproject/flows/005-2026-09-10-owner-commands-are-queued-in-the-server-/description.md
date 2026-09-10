# Owner commands are queued in the server and acknowledged, so a veto can reach a room (D-18 item 6)

Status: formalized. Gated by `docs/roomyx/decisions.md` **D-18 item 6** and the
backlog section "Writer ownership, the owner-command queue, and the read-side
delta", item 6.

## Problem

The owner-injection channel does not work for the orchestrator this package is
designed for, and no field anywhere says so.

- `room.post_owner_command` hands the command to `onOwnerCommand` — **a JS
  function supplied by whoever embeds the server**. A model-driven orchestrator
  spawns `roomyx serve` as a child process and cannot inject a function into it,
  so the tool answers `accepted: false, reason: "No dispatcher is attached"`.
- That is the *normal* case for the primary consumer, and it is the honest
  answer to "nothing will act on this". The problem is that there is no other
  road: the command is discarded, and `prd.md` R5's success criterion ("at least
  one interactive command really reaches the room") has no measurable form.

So the tool is **implemented and unreachable**: registered, tested, answering
correctly, and unable to deliver anything to the consumer it exists for.

Two further facts shape the fix:

- **The server is created per session.** `serveMcpOverHttp` calls
  `options.createMcpServer()` once per MCP session, so any state inside
  `createRoomMcpServer` belongs to one client. A queue there would accept the
  TUI's veto into a structure no other session can read — including the
  dispatcher's. The queue has to live where the room lives: in `serve()`.
- **The server still does not write the log** (D-01). This flow gives it a
  queue, not a pen: the dispatcher reads the queue and writes the line itself.

## Expected Outcome

- A posted owner command is **held** and readable by any other session, so a
  dispatcher that attached no handler can still receive it.
- The response distinguishes **"nobody has read it yet"** from **"nothing will
  act on it"** — the backlog's own requirement, because those are different
  answers and must not share a shape.
- A dispatcher that read a command can **acknowledge** it, so "pending" means
  something and does not decay into "everything ever posted".
- The queue is visible as an MCP **resource** (`room://owner-queue`) as well as
  a tool, because a resource is the shape a host can subscribe to.
- `onOwnerCommand` remains a second road into the same structure, not a
  parallel one.
- Nothing in this flow writes the room log.

## Out of Scope

- **Push notification of the queue.** The server *can* push here (it receives
  the command itself, over HTTP, unlike the transcript), and `resources/subscribe`
  is the mechanism — but a subscription only means something if the host acts on
  the notification, and no host in this project has been shown to. Land the
  readable queue first; the subscription is a follow-up with a consumer.
- **D-18 item 5** (`room.get_delta_for`) — same tool file, separate flow, so the
  review is about one change.
- **D-18 item 8** (a representation for `goal_edit`): the queue delivers the
  command, and *where it lands* is that decision's problem.
- **Persisting the queue across a restart.** It lives as long as the server,
  which is as long as the room (the server is not a daemon). A room whose server
  restarted has no dispatcher and no queue, which is the same state it was in
  before.
- **Owner commands typed into the log by the TUI.** The TUI still never writes.
