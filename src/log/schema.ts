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
] as const;

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

export const messageLineSchema = z.object({
  type: z.literal("message"),
  seq: z.number().int().min(1),
  from: z.string().min(1),
  in_reply_to: z.number().int().min(1).optional(),
  kind: messageKindSchema.optional(),
  body: z.string(),
});
