# Context

Filled from reading the code.

## The decisions and items this implements

- `docs/roomyx/decisions.md` **D-18 item 6** — the queue lives in the server, as
  a read tool plus a resource, with an ack; `onOwnerCommand` stays a second road
  into the same queue.
- `docs/roomyx/decisions.md` **D-16 item 4** — owner delivery must work **between
  processes**, not only inside the dispatcher's process. This is that item made
  real.
- `docs/roomyx/improvement-backlog.md`, item 6 — the five failing tests this flow
  has to turn into passing ones, including "the post response must not report
  `accepted: false` for a command that is in fact queued".

## Files in scope, with what is there now

| File | What matters here |
|---|---|
| `src/server/index.ts` | `OWNER_COMMAND_KINDS`, `OwnerCommand`, `OwnerCommandResult { accepted, reason? }`, and `room.post_owner_command` — which forwards to `options.onOwnerCommand` or refuses |
| `src/server/serve.ts` | `serve(logPath, options)`: reads the log, builds the lease, and passes `createMcpServer: () => createRoomMcpServer(logPath, { onOwnerCommand })` down |
| `src/server/http-transport.ts` | `createMcpServer()` is called **once per session** (line 141, inside `createSession`) — the fact that decides where the queue can live |
| `src/client/mcp-client.ts` | `postOwnerCommand` returns `{ accepted, reason? }` and the TUI renders it as "accepted"/"not accepted" |
| `src/client/index.ts` | The three `setNotice` calls that display the verdict |
| `test/server/owner-command.test.ts` | Four cases, including "with no dispatcher attached it refuses" — that case's *expectation* changes here, because refusing is no longer what should happen to a command nothing has read |

## The SDK surface being used

`McpServer.registerResource(name, uri, config, readCallback)` — a **string** uri
registers a concrete resource (a template object registers the other kind). The
callback returns `{ contents: [{ uri, text }] }`, the same text/JSON discipline
the tools use. `resources/list` is served by the SDK off the registrations, so
advertising the resource and being able to read it are the same act.

## Constraints

- **The server does not write the room log.** D-01. The queue is in-memory and
  separate from the log; the dispatcher reads it and writes what it decides.
- **Per-session server instances.** Any state created inside
  `createRoomMcpServer` is invisible to every other session. The queue is created
  in `serve()` and injected, and the test must post from one session and read
  from another — otherwise it passes while the feature does not work.
- **A bounded resource.** The server lives as long as the room and a room can run
  for hours; a queue nothing drains grows for as long as the TUI keeps posting.
  This project already shipped one unbounded-retention defect (session
  accumulation, R5) and the fix pattern is a stated ceiling rather than hope.
- D-13: the post response shape changes (`accepted` → a status), which is a CLI/
  MCP-surface change for a caller that reads it — a **minor**.
