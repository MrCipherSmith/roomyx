import { getAgentDelta, loadRoomLog } from "../../log/store";
import type { AgentDelta } from "../../log/types";

/**
 * MCP tool `room.get_delta_for`: what a participant has not seen, by the
 * convention of "everything after its own last message". Read-only.
 *
 * It returns the cursor it used and where that cursor came from, so an empty
 * delta means "nothing new" and not "the caller passed the wrong cursor".
 */
export function getAgentDeltaTool(logPath: string, agentId: string, sinceSeq?: number): AgentDelta {
  const { state, messages } = loadRoomLog(logPath);
  return sinceSeq === undefined
    ? getAgentDelta(messages, state.roster, agentId)
    : getAgentDelta(messages, state.roster, agentId, sinceSeq);
}
