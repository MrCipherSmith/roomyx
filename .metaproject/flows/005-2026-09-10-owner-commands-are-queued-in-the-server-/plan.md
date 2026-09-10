# Implementation Plan

Status: ready to freeze.

## Approach

A queue owned by the room, injected into every session's server, readable by all
of them, and never written anywhere else.

The decisive fact is that `createMcpServer()` runs **once per session**. State
inside `createRoomMcpServer` belongs to one client, so a queue built there would
accept the TUI's veto into a structure the dispatcher's session cannot see — a
feature that passes a single-session test and does nothing in the shape it exists
for. So `serve()` creates the queue and injects it, exactly as it already injects
the writer lease.

Three surfaces over one structure:

| Surface | What it is for |
|---|---|
| `room.post_owner_command` | a client posts; the response says **queued** or what a handler decided |
| `room.get_pending_owner_commands` | the dispatcher reads what nobody has acted on |
| `room://owner-queue` | the same, as a resource — the shape a host can subscribe to later |
| `room.ack_owner_command` | the dispatcher says "I have this", so pending means something |

## Result shape, and why it changes

```ts
export type OwnerCommandStatus = "queued" | "accepted" | "refused";
export interface OwnerCommandResult {
  id: string;
  status: OwnerCommandStatus;
  reason?: string;
}
```

The old `{ accepted: boolean }` could not express the distinction the backlog
demands: a command held for a dispatcher that has not read it yet is *not* the
same as a command nothing will ever act on, and `accepted: false` was used for
both. `queued` is the new third answer, and it is the normal one for a bare
`serve`.

Settling rules, so "pending" has one meaning — *nobody has acted on it yet*:

- **no handler** → `queued`; it stays pending until acknowledged.
- **handler accepts** → `accepted`; the handler *is* the dispatcher, so the
  command is delivered and leaves the pending set.
- **handler refuses** → `refused`, with the handler's reason; it also leaves the
  pending set, because a refusal is an action.

Both roads settle the same entry, so a host cannot double-act on one command.

## Steps

1. **Red tests first**, run and captured. The load-bearing one posts from one
   session and reads from another — the bug a single-client test cannot see.
2. The queue type and its bound, in `src/server/owner-queue.ts`.
3. `createRoomMcpServer` takes the queue; posts enqueue and settle; the read
   tool, the resource and the ack are registered.
4. `serve()` creates the queue and injects it; `onOwnerCommand` still receives
   everything posted, so an embedding host sees no behaviour change beyond the
   response shape.
5. The TUI renders the new status: `queued` must not read as a failure.
6. `bun run check`; CHANGELOG; minor version per D-13.

## Risks

- **The bound is a real trade.** When the queue is full, an owner command is
  refused with a reason naming what is stuck. The alternative — unbounded — is
  the retention defect this project already fixed once in the session map. A
  refusal an operator can see beats a leak nobody measures.
- **`queued` can read as failure.** The TUI's current text is "accepted"/"not
  accepted", so mapping the new status carelessly would show the normal case as
  an error. The client's wording is part of the change, not an afterthought.
- **A handler that returns `accepted: true` without acting** settles the command
  and loses it. That is the embedding host's own code and out of reach here, but
  it is why the handler path settles rather than queueing a second copy: two
  deliveries of one veto is worse than one delivery that a stub dropped.
- **Resource registration is per server instance**, so each session registers its
  own `room://owner-queue` over the shared queue. That is the SDK's shape, and it
  is why the *queue*, not the registration, is what gets injected.
