# Context

Filled from reading the code and the fixture.

## The decision and item this implements

- `docs/roomyx/decisions.md` **D-18 item 5** — the tool, its default derived from
  the agent's own last message, and the explicit override.
- `docs/roomyx/decisions.md` **D-16 item 3** — why delivery stays out: a subagent
  wakes only when its parent calls it.
- `docs/roomyx/improvement-backlog.md`, item 5 — the four failing tests, including
  "a test fails when the tool's own description claims the result is *what was
  delivered*".

## Files in scope

| File | What matters |
|---|---|
| `src/log/store.ts` | `getAgentDetail` already computes `lastSeenSeq` = max of an agent's own `seq`; `getTranscript` filters `seq > since`. The delta is those two ideas composed, and composing them here keeps the log module the owner of log arithmetic |
| `src/log/types.ts` | `AgentDetail` (`found: true/false`) is the precedent for a not-found result that is not an empty list |
| `src/server/tools/get-agent-detail.ts` | The shape a tool wrapper takes: `(logPath, ...args)` → the store function |
| `src/server/index.ts` | Where the tool is registered; four tools today, and the four later flows each added one without touching the others |
| `test/server/tools.test.ts` | Where the backlog asks for the failing tests |
| `test/fixtures/sample-room.jsonl` | yuki: seq 1, 3. omar: seq 2. zara: seq 4. So the default deltas are yuki → `[4]`, omar → `[3, 4]`, zara → `[]`, and each is a different boundary case |

## The boundary, stated precisely

`lastSeenSeq` is the maximum of the agent's own seq. The delta is
`seq > cursor` **and** `from !== agent_id`.

Two consequences worth pinning in tests, because each is a way to be wrong:

- A message at `seq === cursor` is **not** in the delta. For the default cursor
  that message is the agent's own, so the two rules agree; the agreement is what
  "everything since your last turn" means.
- Its own messages are excluded **at any cursor**, including an explicit `0` —
  an agent does not need to be told what it said. This is the case the fixture
  makes visible: yuki with `since_seq: 0` must return `[2, 4]`, not `[1, 2, 3, 4]`.

## Constraints

- **The server still does not write the log** (D-01). This is a read tool, and the
  existing "no tool writes to the room log" test must keep covering it.
- **The description must not overclaim.** The backlog files a doc that claims
  more than the code can know as a defect in its own right; here the temptation
  is "what the agent has not received", and the server cannot know that. The
  honest statement is "everything after that participant's own last message,
  which is a convention for what it has probably not seen".
- **Read-only and stateless.** Nothing is stored between calls, because a cursor
  the server owned would belong to one session's server instance — the lesson of
  flow 005's per-session factory.
- D-13: this adds an MCP tool, which is backward compatible, and changes no
  existing response shape — a **patch** under this versioning rule, not a minor.
