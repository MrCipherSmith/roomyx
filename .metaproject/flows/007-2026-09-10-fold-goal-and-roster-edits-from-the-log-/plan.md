# Implementation Plan

Status: ready to freeze.

## Approach

One optional field, one consistency rule in the schema, and a fold in the reader.

```ts
// schema.ts — the single home of the rule (D-08)
export const MESSAGE_KINDS = [..., "goal_edit", "add_participant"] as const;

export const messageChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("goal_contract"), goal_contract: goalContractSchema }),
  z.object({ type: z.literal("roster"), add: z.array(rosterEntrySchema).min(1) }),
]);

export const messageLineSchema = z
  .object({ ..., change: messageChangeSchema.optional() })
  .superRefine((m, ctx) => {
    // The rule, once: an edit kind must carry its change, and the change must be
    // the one that kind means. The writer refuses on this; the reader skips on it.
  });
```

The fold lives in `store.ts`, beside the rest of the log arithmetic:

```ts
// header -> state; then each message with a folding `change`, in seq order.
// Last edit wins. A message whose change the schema refuses is skipped.
```

Two consequences worth stating before the code:

**Body stays prose.** The transcript is what a person reads, and D-19 rejects a
JSON body for exactly that reason: `goal_edit` shows as a tagged message with a
readable sentence, and the structure travels beside it.

**The reader skips, the writer refuses, and both read the same rule.** A message
the schema rejects cannot be written through the append path — it already
validates before writing — so the only way one exists is a hand-edited file. The
fold skipping it is what keeps the room readable, which matters more than folding
a change nobody could have written legitimately.

## Steps

1. **Red tests first**, run and captured: the header alone still yields the header;
   one goal edit folds; two edits fold in order with the last winning; an
   `add_participant` grows the roster; an edit without its change is refused by
   the writer and skipped by the reader; a log with no edits is byte-identical in
   what it yields to today's reader.
2. `messageChangeSchema` and the consistency rule in `schema.ts`.
3. The fold in `store.ts`; `updated_by`/`updated_in_round` filled from the edit.
4. `--json` accepts `change`; the CLI's kind list picks up the new kinds.
5. Docs: `docs/roomyx/README.md`'s log-format section, CHANGELOG, minor version.
6. `bun run check`; the existing no-write assertions still hold.

## Risks

- **The fold is read-path work in a hot path.** `loadRoomLog` runs on every tool
  call, and the fold walks the messages that are already being parsed — linear,
  no extra read. The unmeasured cost is the full-file re-read R10 left open, not
  this.
- **An edit that cannot be folded looks like a bug to whoever wrote it by hand.**
  The mitigation is the rule being one place: the writer says why it refuses, and
  the tool that reads can say it found one it skipped — worth doing only if it
  stays one line, otherwise the transcript already shows the message.
- **`add_participant` duplicates an id already in the roster.** Whether that is an
  edit, a refusal or a no-op is *not* decided here; the fold is an append and the
  reader can see it. Named because a later reader will wonder, and because
  deciding it would be scope creep past D-19.
- **`archiveRoom` records the header's goal.** After this, a closed room's history
  shows the goal it was *created* with, not the one it ended with. Recorded as a
  known divergence rather than fixed silently in this flow.
