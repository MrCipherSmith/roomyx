import { z } from "zod";

/**
 * The room log's on-disk contract, owned here and depended on by **both**
 * directions.
 *
 * It used to live in `store.ts` and be applied only on read, while `write.ts`
 * had nothing but TypeScript types — which are erased at the CLI boundary,
 * where `--kind` was cast with `as never`. So the writer admitted values the
 * reader refused, and the log is append-only with no repair command: one
 * `roomyx room append --kind bogus-kind` exited 0, wrote the line, and made
 * every subsequent read of that room throw forever. The server kept binding and
 * kept registering, so `rooms list` still called the room live while the
 * attached client sat on "disconnected" against a healthy server.
 *
 * A writer whose output its own reader rejects is the thing this module exists
 * to make impossible. Both sides import from here; neither redeclares.
 */

export const MESSAGE_KINDS = [
  "pitch",
  "question",
  "challenge",
  "answer",
  "vote",
  "status",
  "research",
  // D-19: the two kinds that change a room's state. The header cannot be
  // rewritten and a second state line makes the room unreadable, so an edit is a
  // message — and because it is a message it is also visible in the transcript,
  // which is where this project already puts state changes.
  "goal_edit",
  "add_participant",
] as const;

/** The kinds that must carry a `change`, and which change each one means. */
export const EDIT_KINDS = { goal_edit: "goal_contract", add_participant: "roster" } as const;

export type EditKind = keyof typeof EDIT_KINDS;

export const rosterEntrySchema = z.object({ id: z.string(), name: z.string() });

export const goalContractSchema = z.object({
  version: z.number().int().min(1),
  updated_in_round: z.number().int().min(0).optional(),
  updated_by: z.literal("owner").optional(),
  goal_statement: z.string(),
  criteria: z.string(),
  threshold: z.object({
    fail_below: z.number(),
    pass_at_or_above: z.number(),
  }),
});

export const messageKindSchema = z.enum(MESSAGE_KINDS);

export const stateLineSchema = z.object({
  type: z.literal("state"),
  goal_contract: goalContractSchema,
  roster: z.array(rosterEntrySchema),
});

/**
 * What an edit message changes, as a discriminated payload.
 *
 * It travels in a field of its own rather than in `body` because the transcript
 * is what a person reads: a JSON blob in the message pane is unreadable, and the
 * body of an edit stays a sentence ("raise the pass mark to 85").
 */
export const messageChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("goal_contract"), goal_contract: goalContractSchema }),
  z.object({ type: z.literal("roster"), add: z.array(rosterEntrySchema).min(1) }),
]);

export type MessageChange = z.infer<typeof messageChangeSchema>;

/**
 * The log's message contract, and the one place the edit rule is expressed.
 *
 * D-08 is why the rule lives here rather than in the writer and the reader
 * separately: "a writer whose output its own reader rejects is the thing this
 * module exists to make impossible". The writer refuses on this rule and the fold
 * skips on it — two uses of one rule, not two rules.
 *
 * `change` is optional, which is what keeps the format change additive: every
 * message written by every earlier version still validates.
 */
export const messageLineSchema = z
  .object({
    type: z.literal("message"),
    seq: z.number().int().min(1),
    from: z.string().min(1),
    in_reply_to: z.number().int().min(1).optional(),
    kind: messageKindSchema.optional(),
    body: z.string(),
    change: messageChangeSchema.optional(),
  })
  .superRefine((message, ctx) => {
    // Shape rules only — deliberately not "an edit kind must carry a change".
    //
    // That rule would make the message *invalid*, and an invalid line makes a room
    // unreadable forever: the log is append-only with no repair command. So a
    // `goal_edit` with no change is a **valid message that simply is not an
    // edit**, and the fold ignores it. Whether an edit kind carries its change is
    // a rule about *applying* a message, not about the message being well-formed,
    // and conflating the two would have invented a new way for a log to die.
    if (message.change === undefined) return;

    const expected = message.kind === undefined ? undefined : EDIT_KINDS[message.kind as EditKind];
    if (expected === undefined) {
      // A change on an ordinary message will never be applied by anything, so
      // accepting it would let a writer believe it changed state it did not.
      ctx.addIssue({
        code: "custom",
        path: ["change"],
        message: `a "change" requires an edit kind (${Object.keys(EDIT_KINDS).join(", ")}), not "${message.kind ?? "none"}"`,
      });
      return;
    }
    if (message.change.type !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["change", "type"],
        message: `kind "${message.kind}" carries a "${message.change.type}" change; it must be "${expected}"`,
      });
    }
  });
