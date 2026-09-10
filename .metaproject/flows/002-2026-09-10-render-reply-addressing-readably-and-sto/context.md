# Context

Collected deterministically by `keryx flow init` at 2026-09-10T09:51:56.511Z.
The flow-init skill enriches this with formalization, brainstorm results, and
interview answers.

## Code Graph

- `.metaproject/data/gdgraph/artifacts/summary.md`
- `.metaproject/data/gdgraph/artifacts/module-map.json`

Use `keryx gdgraph affected <file>` for blast radius.

## Enabled Metaproject Modules

- gdgraph
- gdctx
- gdwiki
- gdskills
- memory
- tasks
- health
- testing
- security

## Agent Findings

### The decision this work implements

- `docs/roomyx/decisions.md` **D-17** — addressing is shown as what a reader
  reads (name + short quote), not as a sequence number; the format is computed
  by one function; the pointer is not suppressed by a collapsed header.
- `docs/roomyx/improvement-backlog.md`, section *Filed after the room — the
  reply pointer (against 0.7.1)* — the three defects and the draft acceptance
  criteria this flow turns into tests.

### Files in scope, with what is actually there

| File | What matters here |
|---|---|
| `src/client/components/message-row.ts` | `tagFor()` (draft), tag added **inside** `if (options.showHeader)`, `TAG_FG`/`SPEAKER_FG`/`BODY_FG` are the whole palette (three tones) |
| `src/client/transcript.ts` | `matches()` haystack = `fromName + kind + body` (tag missing); `toText()` re-implements the tag inline; `startsRun()` computed over `visible()` |
| `src/client/screens/chat-view.ts` | `addRow()` passes `showHeader: this.transcript.startsRun(index)`; `rebuild()` destroys rows with `destroyRecursively()`; `appendEntry()` appends under the current filter only |
| `src/log/types.ts` | `MessageEnvelope { seq, from, in_reply_to?, kind?, body }` — all data needed is already present |
| `src/log/store.ts` | `getAgentDetail()` — `lastSeenSeq` is `max` of the agent's own `seq` (precedent for a convention, not a cursor) |

### Existing tests that constrain the change

- `test/client/message-row.test.ts` — the row's own unit tests.
- `test/client/transcript.test.ts` — filter/search/model behaviour.
- `test/client/render.test.ts` — headless render assertions (roster, goal
  statement, and the seq-1 regression the backlog's R1 demanded).
- `test/client/wrap-defect.test.ts` — a `test.failing` tripwire. Any change to
  row width or indentation is measured against it; it must **stay failing**, and
  no new wrap boundary may be introduced.
- `test/client/search-prompt.test.ts` — search UI over the model.

### Constraints inherited from the project

- Meaning must live in text, not colour: the palette is three tones, and neither
  a screen reader nor a `tee` sees colour (`docs/roomyx/tui-review.md`, Ken).
- The pointer sign stays ASCII: `→` / `↩` are East-Asian-ambiguous, and a wrong
  width guess shifts the whole wrapped row (`message-row.ts` comment).
- `kind` and `in_reply_to` are written by the dispatcher and validated by
  `src/log/schema.ts`; this flow renders them and must not change the log
  contract.
- D-13: this is a **patch** (rendering only, no MCP tool surface, no CLI flag and
  no log format change).
