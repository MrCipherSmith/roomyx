import { randomUUID } from "node:crypto";

/**
 * The owner-command vocabulary, which lives here rather than in `index.ts`
 * because this is where a command first exists.
 *
 * It is here for a structural reason, not a tidy one: `index.ts` imports the
 * queue, so a queue that imported the vocabulary back from `index.ts` made the
 * two modules cyclic. The cycle happened to work under this loader — the
 * bindings are only read inside functions — but "happens to work" is the kind of
 * thing that stops being true when a bundler or a load order changes, and the
 * fix costs nothing: one direction of dependency instead of two.
 */
export const OWNER_COMMAND_KINDS = ["veto", "constraint", "add_participant", "goal_edit"] as const;

export type OwnerCommandKind = (typeof OWNER_COMMAND_KINDS)[number];

export interface OwnerCommand {
  kind: OwnerCommandKind;
  body: string;
}

/**
 * A command as it reaches a dispatcher: the same two fields, plus the queue
 * entry's id.
 *
 * The id is what lets an embedded handler and a queue reader talk about the same
 * command — the handler can settle it, or name it in the log line it writes, and
 * the two roads meet at one identity instead of at a coincidence of body text.
 */
export interface OwnerCommandEnvelope extends OwnerCommand {
  id: string;
}

/**
 * The owner-command queue, and the reason it is a separate object.
 *
 * `room.post_owner_command` used to hand the command straight to
 * `onOwnerCommand` — a JS function supplied by whoever embeds the server. A
 * model-driven orchestrator spawns `roomyx serve` as a child process and cannot
 * inject a function into it, so for the consumer this feature exists for, the
 * tool answered "no dispatcher is attached" and the command was **discarded**.
 * `prd.md` R5's criterion ("at least one interactive command really reaches the
 * room") had no measurable form because nothing was ever held anywhere.
 *
 * The queue is why it lives here and not inside `createRoomMcpServer`:
 * `serveMcpOverHttp` calls that factory **once per session**, so state created
 * inside it belongs to one client. A queue built there would accept the TUI's
 * veto into a structure the dispatcher's own session cannot read — a feature
 * that passes every single-client test and does nothing in the shape it exists
 * for. `serve()` creates the queue and injects it into every session instead.
 *
 * **The server still does not write the room log** (D-01). This is a queue, not
 * a pen: the dispatcher reads it and writes what it decides.
 */

/**
 * How many unacknowledged commands are held before posting is refused.
 *
 * A bound rather than unbounded, because the server lives exactly as long as the
 * room and a room runs for hours: with nothing draining it, the queue grows for
 * as long as somebody keeps posting. This project has already shipped one
 * unbounded-retention defect — every MCP session retained for the life of the
 * process — and the fix was a stated ceiling rather than hope. A refusal an
 * operator can read beats a leak nobody measures.
 *
 * 32 is far more than a room needs (an owner sends a veto, not a stream) and
 * small enough that a full queue means something is genuinely wrong.
 */
export const OWNER_QUEUE_LIMIT = 32;

export interface QueuedOwnerCommand {
  id: string;
  kind: OwnerCommandKind;
  body: string;
  /** ISO timestamp, so a dispatcher can tell a fresh veto from a stale one. */
  postedAt: string;
}

/** Thrown when the queue is full. Carries the count, because the number is the diagnosis. */
export class OwnerQueueFullError extends Error {
  constructor(readonly waiting: number) {
    super(
      `The owner-command queue is full: ${waiting} command(s) have been posted and none has been acknowledged. ` +
        `Nothing is reading the queue — a dispatcher reads it with \`room.get_pending_owner_commands\` and settles each one with \`room.ack_owner_command\`.`,
    );
  }
}

export class OwnerCommandQueue {
  private readonly pending = new Map<string, QueuedOwnerCommand>();

  /**
   * Holds a command, or refuses when nothing has drained the queue.
   *
   * The refusal is the honest failure: silently dropping the oldest would lose
   * a veto, and silently growing would leak. Refusing says which of the two
   * problems the operator actually has.
   */
  post(kind: OwnerCommandKind, body: string): QueuedOwnerCommand {
    if (this.pending.size >= OWNER_QUEUE_LIMIT) throw new OwnerQueueFullError(this.pending.size);
    const command: QueuedOwnerCommand = {
      id: `cmd-${randomUUID().slice(0, 8)}`,
      kind,
      body,
      postedAt: new Date().toISOString(),
    };
    this.pending.set(command.id, command);
    return command;
  }

  /** Oldest first: an owner command is a queue, not a set. */
  list(): QueuedOwnerCommand[] {
    return [...this.pending.values()];
  }

  /**
   * Settles one command. False when the id is not held.
   *
   * Returning false rather than throwing, because the caller decides how loud it
   * should be: the tool turns it into an error, while the handler path calls it
   * right after posting a command it knows is there.
   */
  ack(id: string): boolean {
    return this.pending.delete(id);
  }
}
