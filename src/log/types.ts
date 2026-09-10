import type { MessageChange } from "./schema";

export interface MessageEnvelope {
  seq: number;
  from: string;
  in_reply_to?: number;
  kind?:
    | "pitch"
    | "question"
    | "challenge"
    | "answer"
    | "vote"
    | "status"
    | "research"
    | "goal_edit"
    | "add_participant";
  body: string;
  /** Present only on an edit message; see `EDIT_KINDS` and D-19. */
  change?: MessageChange;
}

export interface RosterEntry {
  id: string;
  name: string;
}

export interface GoalContractThreshold {
  fail_below: number;
  pass_at_or_above: number;
}

export interface GoalContract {
  version: number;
  updated_in_round?: number;
  updated_by?: "owner";
  goal_statement: string;
  criteria: string;
  threshold: GoalContractThreshold;
}

export interface RoomState {
  goal_contract: GoalContract;
  roster: RosterEntry[];
  /**
   * The log this server is serving, absolute.
   *
   * Present so a liveness probe can ask *which room is this*, not merely
   * *does anything answer here*. Every `roomyx serve` defaults to port 4319, so
   * without it a room that died without deregistering was resurrected as live
   * by the next room to bind the port — and `roomyx-client --room <dead-id>`
   * then rendered a different room's transcript under the dead room's id.
   *
   * It exposes a filesystem path to a caller that can already read the whole
   * transcript, which is a smaller disclosure than the one it prevents.
   *
   * Optional, and that is a versioning decision rather than a hedge: making it
   * required would break anyone constructing a `RoomState`, which would put
   * this release in the minor position under D-13. The probe already treats an
   * absent value as "cannot be shown to be a different room", because that is
   * what an older server returns.
   */
  log_path?: string;
  /**
   * Whether anything is dispatching into the room this server is serving —
   * i.e. whether the process that embedded this server supplied an
   * owner-command handler.
   *
   * Optional, for the same D-13 reason as `log_path`: making it required would
   * break every construction of a `RoomState`, which is a minor bump on its own.
   * A consumer that reads an absent value must treat it as "cannot be shown to
   * be dispatching", never as `false` — the two are different claims.
   */
  dispatcherAttached?: boolean;
}

/**
 * What a participant has not seen, according to the convention the dispatcher
 * used to apply by hand: everything after that participant's own last message,
 * excluding its own.
 *
 * `cursor_from` is not decoration. The server knows the convention; it does
 * **not** know what was delivered to anyone — a dispatcher may have failed to
 * send, or sent twice — and a caller must not have to guess which of the two
 * produced the cursor it is looking at.
 */
export type AgentDelta =
  | {
      found: true;
      agent: RosterEntry;
      messages: MessageEnvelope[];
      /** The cursor this delta was computed from. */
      since_seq: number;
      cursor_from: "agent-last-message" | "caller";
    }
  | { found: false };

export type AgentDetail =
  | { found: true; agent: RosterEntry; messages: MessageEnvelope[]; lastSeenSeq: number }
  | { found: false };
