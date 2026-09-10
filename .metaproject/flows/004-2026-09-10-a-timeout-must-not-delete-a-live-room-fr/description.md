# A timeout must not delete a live room from the registry (R7, timeout half)

Status: formalized. Backlog item **R7**, second half — the half the backlog names
as the one with the victim.

## Problem

`listLiveRooms` prunes an entry, and writes its history record, whenever the
liveness check does not confirm it. The check conflates three different answers:

- `probeRoomState` returns `undefined` for **both** "could not reach it" (connect
  refused, connect timed out, `tools/call` timed out) **and** "the process is
  gone".
- `isRoomLive` maps that `undefined` to `false`.
- `listLiveRooms` treats `false` as gone: it removes the entry from
  `registry.json` **and** appends a history record claiming the room ended.

So a room that is alive but slow — or `SIGSTOP`ped, or on a machine under load —
is deleted from the registry for not answering within 500 ms. The pid pre-filter
does not save it: `process.kill(pid, 0)` succeeds for a stopped process.

R7 states the rule this violates in its own words:

> **Identity mismatch is the one case where deleting is correct — a timeout never
> is.**

The identity half is already implemented (the probe compares `log_path`, and the
pid is checked first). What is missing is the timeout half: the unknown answer is
indistinguishable from the gone answer, so it is treated as gone.

## Expected Outcome

- A liveness check has **three** answers, and they are different values:
  `live`, `gone`, `unknown`.
- `gone` is only ever reached by evidence that the entry cannot be this room:
  the registered pid is not running, or a server answered and named a different
  log. Pruning and the history record follow `gone` alone.
- `unknown` keeps the entry in the registry and writes nothing to history. A
  later probe may confirm it either way.
- `rooms list` stops being silent about it: an entry that did not answer is
  printed as such, rather than dropped from a list that then says "No live
  rooms" about a registry that has one.
- Consumers that decide what to attach to keep seeing confirmed-live rooms only;
  the unknown set is a separate channel, so `roomyx-client` never auto-attaches
  to a room that did not answer.

## Out of Scope

- **A `room.health` tool returning the room id the server registered under**
  (R7's own suggested fix). The `log_path` comparison already supplies identity,
  and adding a tool changes the MCP surface — a separate flow, and it needs the
  same versioning call D-18 item 5/6 will need.
- **The 500 ms timeout value.** This flow makes the timeout non-destructive; it
  does not tune it. A configurable timeout is a different change with its own
  argument.
- **Pid reuse.** A reused pid that is alive keeps an entry in the `unknown` set
  where it will stay until something answers on that port. Named as the known
  limit of using the pid as a pre-filter rather than as the assertion, and it is
  strictly better than deleting a live room.
- Nothing about D-18 items 5, 6, 8, R10 or R12.
