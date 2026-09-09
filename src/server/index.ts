import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStateTool } from "./tools/get-state";
import { getTranscriptTool } from "./tools/get-transcript";
import { getAgentDetailTool } from "./tools/get-agent-detail";

/**
 * Builds the roomyx MCP server for a given room log file. Read-only: none
 * of the three registered tools ever writes to `logPath` (R2-R4, AC4 —
 * `room.post_owner_command`, the write path, is out of scope for this
 * package; see docs/requirements/roomyx/).
 */
export function createRoomMcpServer(logPath: string): McpServer {
  const server = new McpServer({ name: "roomyx", version: "0.1.0" });

  server.registerTool(
    "room.get_state",
    {
      title: "Room state",
      description: "Roster and current goal contract for this room.",
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(getStateTool(logPath)) }],
    }),
  );

  server.registerTool(
    "room.get_transcript",
    {
      title: "Room transcript delta",
      description: "Messages with seq greater than since_seq, in order.",
      inputSchema: { since_seq: z.number().int().min(0) },
    },
    async ({ since_seq }) => ({
      content: [{ type: "text", text: JSON.stringify(getTranscriptTool(logPath, since_seq)) }],
    }),
  );

  server.registerTool(
    "room.get_agent_detail",
    {
      title: "Agent detail",
      description: "One participant's own messages and last-seen status.",
      inputSchema: { agent_id: z.string().min(1) },
    },
    async ({ agent_id }) => ({
      content: [{ type: "text", text: JSON.stringify(getAgentDetailTool(logPath, agent_id)) }],
    }),
  );

  return server;
}
