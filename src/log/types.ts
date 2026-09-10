export interface MessageEnvelope {
  seq: number;
  from: string;
  in_reply_to?: number;
  kind?: "pitch" | "question" | "challenge" | "answer" | "vote" | "status" | "research";
  body: string;
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
}

export type AgentDetail =
  | { found: true; agent: RosterEntry; messages: MessageEnvelope[]; lastSeenSeq: number }
  | { found: false };
