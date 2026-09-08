import { getAgentDetail, loadRoomLog } from "../../log/store";
import type { AgentDetail } from "../../log/types";

/** MCP tool `room.get_agent_detail`: one participant's own messages + status. Read-only. */
export function getAgentDetailTool(logPath: string, agentId: string): AgentDetail {
  const { state, messages } = loadRoomLog(logPath);
  return getAgentDetail(messages, state.roster, agentId);
}
