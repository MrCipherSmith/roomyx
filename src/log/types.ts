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
}

export type AgentDetail =
  | { found: true; agent: RosterEntry; messages: MessageEnvelope[]; lastSeenSeq: number }
  | { found: false };
