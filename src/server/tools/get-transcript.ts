import { getTranscript, loadRoomLog } from "../../log/store";
import type { MessageEnvelope } from "../../log/types";

/** MCP tool `room.get_transcript`: messages with seq > sinceSeq. Read-only. */
export function getTranscriptTool(logPath: string, sinceSeq: number): MessageEnvelope[] {
  const { messages } = loadRoomLog(logPath);
  return getTranscript(messages, sinceSeq);
}
