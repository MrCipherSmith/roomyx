# Compute a participant's delta in the server, so the dispatcher stops carrying the cursor map (D-18 item 5)

Status: formalized. Gated by `docs/roomyx/decisions.md` **D-18 item 5** and the
backlog section "Writer ownership, the owner-command queue, and the read-side
delta", item 5.

## Problem

Every turn, the dispatcher computes by hand what each participant has not seen:
"everything since your last turn" is the phrase the bundled skill uses, and it
means *everything after that participant's own last message, excluding its own*.
That arithmetic — a per-agent cursor map, a filter, and a boundary — lives in a
language model's context and is re-derived on every iteration of the room.

The convention already exists in the code, unused for this purpose:
`getAgentDetail` computes `lastSeenSeq` as the maximum of an agent's own `seq`
(`src/log/store.ts`). So the rule is not being invented here; it is being moved
from the dispatcher's head into the server that already knows how to compute it.

What the backlog asks to be removed is *the cursor map and the manual filter*.
What stays where it is: the judgement about what to do with the delta, and the
`SendMessage` that delivers it — the server cannot send it, and D-16 item 3
records why.

## Expected Outcome

- `room.get_delta_for(agent_id, since_seq?)` returns what a participant has not
  seen, with the cursor that was used stated in the answer.
- Its own messages are never part of the delta, at any cursor.
- An explicit `since_seq` overrides the default, and the answer says which of the
  two produced the cursor — the server knows the convention, it does **not** know
  what was delivered, and the answer must not blur the two.
- An unknown participant gets an explicit not-found result, not an empty delta
  that looks like "nothing new".

## Out of Scope

- **Delivering the delta** — waking a subagent, or sending anything. D-16 item 3:
  a subagent is not a listening process, and its parent is the only thing that
  can start its turn. This tool reduces what the dispatcher must *carry*, not
  what it must *call*.
- **Storing per-agent cursors server-side.** The queue taught the lesson: the
  server factory runs once per session, and a cursor that is not in the log
  cannot be owned by a process that is not the dispatcher. The default cursor is
  derived from the log on every call, which is what makes it stateless and
  therefore shared.
- **The reply-pointer rendering that consumes a delta** (D-17). This is the read
  side.
- **D-18 item 8** (a representation for `goal_edit`) — still a decision.
