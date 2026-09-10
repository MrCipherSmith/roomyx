# Context

Collected deterministically by `keryx flow init` at 2026-09-10, enriched from the
D-18 discussion and from reading the code.

## The decision this work implements

`docs/roomyx/decisions.md` **D-18**, plus the backlog section "Writer ownership,
the owner-command queue, and the read-side delta — against 0.7.1"
(`docs/roomyx/improvement-backlog.md`), whose items 1, 2, 3, 4 and 7 are the
scope here. Each carries a **failing test** that this flow must actually write.

## Files in scope, with what is there now

| File | What matters here |
|---|---|
| `src/cli.ts` | `room append`: the registry check, the `--force` escape (`:175`, `:188`), the hedged refusal text (`:204`). `serve`: registers, then `runUntilSignal` (`:249-`) |
| `src/server/index.ts` | `RoomMcpServerOptions.onOwnerCommand`; the three read tools; `room.get_state` returns `getStateTool(logPath)` — no mention of whether a dispatcher is attached |
| `src/server/serve.ts` | `serve(logPath, options)`: reads the log once before binding, then `serveMcpOverHttp({ createMcpServer: () => createRoomMcpServer(logPath, { onOwnerCommand }) })` |
| `src/server/tools/get-state.ts` | Where `dispatcherAttached` has to surface |
| `src/installer/registry.ts` | `listLiveRooms(registryPath, { prune })` — liveness is an MCP round-trip; `registerRoom`/`deregisterRoom` |
| `src/lockfile.ts` | `withLock` + `releaseLockIfOwned`: the owner-token pattern, the staleness ceiling, and the reason release must check the token. The lease should mirror it rather than invent a second discipline |
| `src/log/write.ts` | `appendMessage` — `seq` allocation and the write are one critical section; validates through `messageLineSchema` before writing |
| `src/log/schema.ts` | `MESSAGE_KINDS` includes `status`, which is what the take-over trace will use — no new kind, no format change |
| `src/bundled-skills/startup-room/SKILL.md` | `:139` `--force` in the documented command; `:143-147` the paragraph defending it; `:120` "those two commands are the whole of it" |

## Existing tests that constrain the change

- `test/cli-room.test.ts` — **currently passes** with a test named "refuses when a
  live room is serving that log, and names the room", whose second half asserts
  that `--force` writes. That half must be deliberately broken by this flow.
- `test/server/tools.test.ts` — where `dispatcherAttached` is asserted.
- `test/server/owner-command.test.ts` — the existing `onOwnerCommand` seam.
- `test/log/write-contract.test.ts`, `test/log/store.test.ts` — the log contract
  must not change.
- `test/cli-serve-lifecycle.test.ts` — real spawned servers; the end-to-end
  ownership verification belongs here or beside it.

## Constraints

- The room log is append-only with no repair command: a writer that emits what
  the reader refuses makes the room unreadable permanently. Any new message the
  flow writes (the take-over trace) goes through `appendMessage`.
- D-13: removing `--force` and adding `--take-over` changes a CLI flag, and
  adding a field to `room.get_state` changes a response — a **minor** (`0.8.0`),
  not a patch. Whether `dispatcherAttached` is required or optional is a
  separate call; `RoomState.log_path` is the in-repo precedent for optional.
- The read-only guarantee of the server is not in question here: D-01 still keeps
  the server from writing the log. This flow gives it a lease file, not a pen.
