import { loadRoomLog } from "../../log/store";
import type { RoomState } from "../../log/types";

/**
 * MCP tool `room.get_state`: roster, goal contract, which log this is, and
 * whether anything is dispatching into it. Read-only.
 *
 * The dispatcher flag comes from the server that built this tool, not from the
 * log — the log cannot know it, and the server has known it all along
 * (`options.onOwnerCommand !== undefined`) without saying.
 */
export function getStateTool(logPath: string, options: { dispatcherAttached?: boolean } = {}): RoomState {
  const { state } = loadRoomLog(logPath);
  if (options.dispatcherAttached === undefined) return state;
  return { ...state, dispatcherAttached: options.dispatcherAttached };
}
