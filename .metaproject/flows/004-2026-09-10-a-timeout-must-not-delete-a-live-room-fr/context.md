# Context

Filled from reading the code, not from the backlog's prose.

## The decision this work implements

`docs/roomyx/improvement-backlog.md`, item **R7** (below the line, unscheduled):
*"Liveness verifies that a port answers, not which room answered, and prunes live
rooms from the file on a 500 ms timeout. A SIGSTOP'd healthy server was deleted
from the registry; the server kept serving and the client said 'No live roomyx
rooms found.'"* — and its rule: identity mismatch is the one case where deleting
is correct; a timeout never is.

## Files in scope, with what is there now

| File | What matters here |
|---|---|
| `src/installer/registry.ts` | `probeRoomState` returns `state \| undefined` (one value for two meanings); `isRoomLive` maps `undefined → false`; `listLiveRooms` prunes every non-live entry **and** calls `archiveRoom` for each |
| `src/cli.ts` | `rooms list` (line ~480) prints what `listLiveRooms` returns, so an unconfirmed room vanishes from the output; `room append` (line ~338) uses `listLiveRooms` to find a room serving the log |
| `src/installer/resolve-connection.ts` | auto-attach: picks the single live room, refuses with the list of candidates when there are several. Must keep seeing confirmed-live only |
| `src/mcp-management/server.ts` | `roomyx.rooms.list` passes `prune: false`; its answer is a network caller's view, so "did not answer" must be visible rather than silently missing |
| `src/installer/history.ts` | `archiveRoom` — the history record this flow must stop writing for an unknown room |

## Existing tests that constrain the change

- `test/installer/registry.test.ts:110` — "a real serve() instance is live, a
  dead port is pruned": the dead entry has `pid: 999999`, which is **not alive**,
  so under the new rule it is `gone` by the pid check and stays pruned. The test
  keeps passing, and it is worth noting *why* — its name says "a dead port",
  while what actually makes it dead is the pid.
- `test/installer/registry.test.ts:200` — the port-reuse case: a dead pid, and a
  live pid whose `log_path` differs. Both are `gone` and must stay pruned.
- `test/installer/history.test.ts:165` — a crashed room (`pid: 4194303`, not
  alive, invalid port 1) is pruned **and** archived. That behaviour must survive:
  this flow narrows what counts as gone, and it must not narrow it to nothing.
- `test/installer/history.test.ts:195` — `prune: false` archives nothing.

## Constraints

- The registry is written under a lockfile and replaced by temp-then-rename; the
  re-read under the lock inside `listLiveRooms` exists because a concurrent
  register/deregister can land while the network probes are in flight. Any change
  here keeps that shape.
- D-13: this changes what the CLI prints and what a consumer of
  `roomyx.rooms.list` receives, and it adds a field to an internal return type.
  Whether that is a patch or a minor is decided at the end, against what the
  shipped surface actually becomes.
