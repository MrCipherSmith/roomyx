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
 * The largest `seq` this project will ever write.
 *
 * `Number.MAX_SAFE_INTEGER`: the point past which an integer no longer
 * survives a JSON round-trip, which is the one property a `seq` cannot lose —
 * it is compared, sorted, and used as a cursor everywhere in this package.
 * Exported so `nextSeq` (in `write.ts`) can recognize a recorded value it
 * cannot build a next `seq` from, without redeclaring the number or
 * re-running it through a schema.
 */
export const MAX_SEQ = Number.MAX_SAFE_INTEGER;

/** Shared by both the read and the write message schema below; neither redeclares it. */
const messageLineShape = z.object({
  type: z.literal("message"),
  seq: z.number().int().min(1),
  from: z.string().min(1),
  in_reply_to: z.number().int().min(1).optional(),
  kind: messageKindSchema.optional(),
  body: z.string(),
  change: messageChangeSchema.optional(),
});

/**
 * Shape rules only — deliberately not "an edit kind must carry a change".
 *
 * That rule would make the message *invalid*, and an invalid line makes a room
 * unreadable forever: the log is append-only with no repair command. So a
 * `goal_edit` with no change is a **valid message that simply is not an
 * edit**, and the fold ignores it. Whether an edit kind carries its change is
 * a rule about *applying* a message, not about the message being well-formed,
 * and conflating the two would have invented a new way for a log to die.
 *
 * Shared by the read and write schema below so the rule is checked once, not
 * declared twice and left to drift.
 */
function changeShapeIssue(
  message: Pick<z.infer<typeof messageLineShape>, "kind" | "change">,
): { path: (string | number)[]; message: string } | undefined {
  if (message.change === undefined) return undefined;

  const expected = message.kind === undefined ? undefined : EDIT_KINDS[message.kind as EditKind];
  if (expected === undefined) {
    // A change on an ordinary message will never be applied by anything, so
    // accepting it would let a writer believe it changed state it did not.
    return {
      path: ["change"],
      message: `a "change" requires an edit kind (${Object.keys(EDIT_KINDS).join(", ")}), not "${message.kind ?? "none"}"`,
    };
  }
  if (message.change.type !== expected) {
    return {
      path: ["change", "type"],
      message: `kind "${message.kind}" carries a "${message.change.type}" change; it must be "${expected}"`,
    };
  }
  return undefined;
}

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
 *
 * `seq` is deliberately unbounded above `1` here: this is the schema `store.ts`
 * reads with, and reading has to stay permissive. A hand-crafted or merged-in
 * line at the top of the safe-integer range is a line that already exists —
 * refusing it on read would not un-write it, it would just turn an existing,
 * merely-unwritable-to room into a permanently unreadable one, which is the
 * worse failure (the log is append-only; there is no repair command). See
 * `writeMessageLineSchema` for the bound roomyx itself writes under.
 */
export const messageLineSchema = messageLineShape.superRefine((message, ctx) => {
  const issue = changeShapeIssue(message);
  if (issue) ctx.addIssue({ code: "custom", ...issue });
});

/**
 * The schema `write.ts` validates a built message against before it is
 * appended — same shape as `messageLineSchema`, `seq` additionally bounded at
 * `MAX_SEQ`.
 *
 * This is "bound on write, permissive on read" stated as two schemas rather
 * than one: collapsing them back into a single `messageLineSchema` would mean
 * either the reader refusing a line it must accept (the failure D-08 exists to
 * prevent), or the writer's safety depending on an accident of whatever this
 * zod version's `.int()` happens to bound rather than on a stated contract.
 * Both schemas still come from this one module and this one shape; neither
 * redeclares it.
 */
export const writeMessageLineSchema = messageLineShape
  .extend({ seq: z.number().int().min(1).max(MAX_SEQ) })
  .superRefine((message, ctx) => {
    const issue = changeShapeIssue(message);
    if (issue) ctx.addIssue({ code: "custom", ...issue });
  });
