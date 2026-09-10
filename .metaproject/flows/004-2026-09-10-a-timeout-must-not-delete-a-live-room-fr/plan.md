# Implementation Plan

Status: ready to freeze.

## Approach

One type change, one call site, one line of output.

The defect is a collapsed return type: `probeRoomState → state | undefined`
cannot express "I did not reach it" and "the process is not running" at the same
time, so the caller's `undefined → false` had to mean both. Making liveness a
three-valued type is the whole fix; everything else follows from it.

```ts
export type Liveness = "live" | "gone" | "unknown";

export async function checkRoomLiveness(room, timeoutMs = 500): Promise<Liveness> {
  if (!isPidAlive(room.pid)) return "gone";                  // the process is not running
  const state = await probeRoomState(room, timeoutMs);
  if (state === undefined) return "unknown";                 // could not reach it — NOT gone
  if (state.log_path === undefined) return "live";            // older server: cannot be shown to differ
  return state.log_path === room.logPath ? "live" : "gone";   // a different room took the port
}
```

Only `gone` prunes and archives. `unknown` is kept in the file and returned as a
separate channel, so nothing that decides *what to attach to* can mistake it for
a live room.

The `live` branch keeps its existing asymmetry deliberately: a server too old to
report `log_path` cannot be shown to be a different room, and the backlog already
records why failing toward keeping is the safe direction.

## Steps

1. **Red tests first**, run and captured: an entry with a live pid whose port
   answers nothing is not pruned and is not archived; it is reported as
   unconfirmed; an identity mismatch is still pruned *and* archived; a dead pid
   is still pruned.
2. `Liveness` and `checkRoomLiveness` in `registry.ts`; `listLiveRooms` prunes
   `gone` only, and returns live rooms plus an unconfirmed set.
3. `rooms list` prints unconfirmed entries distinctly instead of dropping them.
4. Check the other consumers keep their semantics — auto-attach must not pick an
   unconfirmed room, and `room append`'s guard still finds a room serving the log.
5. `bun run check`; CHANGELOG; version decision per D-13 against what actually
   shipped.

## Risks

- **Keeping unresponsive entries can accumulate.** A permanently hung process
  leaves an entry nothing removes. This is the deliberate trade — deleting a live
  room is worse — and the pid-reuse case is named as its limit rather than
  papered over. What makes it livable is that the entry is *visible* as
  unconfirmed rather than either deleted or presented as live.
- **The 500 ms probe is load-sensitive**, which is the trigger in production and
  makes a naive test flaky. The deterministic reproduction is a live pid with
  nothing listening: it takes the same `undefined` path as a timeout without
  depending on machine load. A `SIGSTOP`ped server is the same path and is
  recorded as the field reproduction rather than as the test.
- **`rooms list` output changes**, and one existing test asserts on that output
  (`testing-story.md` step 2 asserts "No live rooms."). A registry with no rooms
  at all must still print exactly that — an empty registry is not the same as one
  with an unconfirmed entry.
