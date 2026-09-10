# Implementation Plan

Status: ready to freeze.

## Approach

Compose two functions the log module already owns, and state the cursor in the
answer.

```ts
export interface AgentDelta {
  found: true;
  agent: RosterEntry;
  messages: MessageEnvelope[];
  /** The cursor the delta was computed from. */
  since_seq: number;
  /**
   * Where that cursor came from. The server knows the convention; it does not
   * know what was delivered, and a caller must not have to guess which it got.
   */
  cursor_from: "agent-last-message" | "caller";
}
```

`since_seq` and `cursor_from` are not decoration: without them a caller cannot
tell an empty delta computed from the agent's own last turn (fine) from one
computed from a cursor it passed by mistake (silence). The backlog's fourth
failing test is about a description claiming more than the code knows, and this
is the same rule applied to the response.

The default cursor is recomputed from the log on every call. Nothing is stored,
which is what makes it stateless — and statelessness is what makes it correct
across sessions, given that the server factory runs once per session.

## Steps

1. **Red tests first**, run and captured: the four the backlog names, plus the
   boundary at `seq === cursor` and the unknown-agent case.
2. `getAgentDelta` in `src/log/store.ts`, beside `getAgentDetail`; the type in
   `src/log/types.ts`.
3. `src/server/tools/get-agent-delta.ts` and its registration in
   `src/server/index.ts`, with a description that says what the cursor is and
   what it is not.
4. `bun run check`, including the existing "no tool writes the room log" test
   extended to cover this one.
5. CHANGELOG, patch version per D-13.

## Risks

- **The convention can be mistaken for knowledge.** "Everything after its own
  last message" is a good guess at what a participant has not seen and it is not
  a record of what was delivered: a dispatcher may have failed to send, or sent
  twice. Naming the cursor and its source in the response is the mitigation, and
  a test asserts the wording rather than trusting the author to remember.
- **Composing on read costs a full parse.** `loadRoomLog` re-reads and validates
  the whole file per call, which is R10's other half and is still unmeasured. This
  tool adds one more caller that pays it; that is noted rather than fixed here,
  because the backlog calls memoization speculative without a measurement.
- **An empty delta is ambiguous to a reader of the transcript.** It is not to a
  caller: the cursor and its source are in the answer, which is the difference
  between "nothing new" and "I passed the wrong cursor".
