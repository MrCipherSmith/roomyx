import { loadRoomLog } from "../../log/store";
import type { RoomState } from "../../log/types";

/** MCP tool `room.get_state`: roster, goal contract, and which log this is. Read-only. */
export function getStateTool(logPath: string): RoomState {
  const { state } = loadRoomLog(logPath);
  return state;
}
