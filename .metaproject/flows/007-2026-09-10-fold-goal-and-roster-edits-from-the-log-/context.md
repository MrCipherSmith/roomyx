# Context

Filled from reading the schema, the store and the writer.

## The decision this implements

`docs/roomyx/decisions.md` **D-19**: a message kind carrying the structured change
beside a readable body, and `room.get_state` folding the stream. `D-08` is the
constraint that shapes *how*: the log contract lives in `src/log/schema.ts` and
both sides import it — "a writer whose output its own reader rejects is the thing
this module exists to make impossible".

## Files in scope

| File | What matters |
|---|---|
| `src/log/schema.ts` | Owns `MESSAGE_KINDS`, `rosterEntrySchema`, `goalContractSchema`, `messageLineSchema`. D-08: neither side redeclares the contract, so the new field and its consistency rule go here and both sides get them |
| `src/log/store.ts` | `loadRoomLog` returns `{state, messages}` with the header parsed as the only state. The fold belongs here with the rest of the log arithmetic, so the server and the client both get it |
| `src/log/write.ts` | `appendMessage` / `appendMessages` validate through `messageLineSchema` **before** writing; `buildMessage` assembles the envelope. A new optional field has to survive `--json` |
| `src/log/types.ts` | `GoalContract`, `RosterEntry`, `MessageEnvelope`, `RoomState` |
| `src/server/tools/get-state.ts` | `getStateTool(logPath, { dispatcherAttached })` — where the folded state surfaces |
| `src/cli.ts` | `room append --json <envelope>` and the `--kind` validation list, which reads `MESSAGE_KINDS` |
| `test/log/write-contract.test.ts`, `test/log/store.test.ts` | Where the log contract and the reader are pinned |

## The fixture, and what it means for the fold

`test/fixtures/sample-room.jsonl` has a header plus four messages, none of them
edits — so every existing test about it must keep passing unchanged. That is the
first thing the fold has to satisfy: **a log with no edits reads exactly as it did
before**, which is what makes this additive rather than a new format.

## Constraints

- **Append-only, byte for byte.** The fold reads; nothing rewrites a line. A test
  must assert that reading a log does not change it (the existing "no tool writes
  the room log" test is the precedent).
- **The header stays the first state.** It is the room's original contract and the
  base the fold applies edits to; it is never reinterpreted as one.
- **One rule, one place.** "A `goal_edit` must carry a goal contract" is expressed
  in the schema and nowhere else. The writer refusing and the reader ignoring are
  two *uses* of one rule, not two rules — that is D-08's whole point.
- **The `change` field is optional**, so every message written by every earlier
  version still validates. This is what keeps the format change additive.
- D-13: adding optional fields and message kinds is backward compatible, but the
  format changes and a reader-facing behaviour changes (`get_state` may now differ
  from the header) — **minor**.
