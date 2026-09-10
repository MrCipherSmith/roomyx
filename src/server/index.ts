import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStateTool } from "./tools/get-state";
import { getTranscriptTool } from "./tools/get-transcript";
import { getAgentDetailTool } from "./tools/get-agent-detail";

export const OWNER_COMMAND_KINDS = ["veto", "constraint", "add_participant", "goal_edit"] as const;

export type OwnerCommandKind = (typeof OWNER_COMMAND_KINDS)[number];

export interface OwnerCommand {
  kind: OwnerCommandKind;
  body: string;
}

export interface OwnerCommandResult {
  accepted: boolean;
  /** Why it was not accepted, or how the dispatcher took it. */
  reason?: string;
}

export interface RoomMcpServerOptions {
  /**
   * Supplied by the dispatcher that embeds this server. `room.post_owner_command`
   * hands the command to it and returns whatever it says.
   *
   * There is deliberately no default that writes anywhere. D-01 makes the
   * dispatcher the log's single writer, and D-02 explicitly rejected the
   * obvious shortcut — a second, home-grown command file for the dispatcher to
   * poll. So with no handler attached the tool exists and refuses, which is
   * the honest answer for a bare `roomyx serve`: nothing is dispatching, and
   * pretending a command was accepted would be worse than saying so.
   */
  onOwnerCommand?: (command: OwnerCommand) => OwnerCommandResult | Promise<OwnerCommandResult>;
}

/**
 * Builds the roomyx MCP server for a given room log file. Nothing here writes
 * to `logPath` — not the three read tools (R2-R4, AC4), and not
 * `room.post_owner_command`, which only forwards to the dispatcher (R5, D-01).
 */
export function createRoomMcpServer(logPath: string, options: RoomMcpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "roomyx", version: "0.1.0" });

  server.registerTool(
    "room.get_state",
    {
      title: "Room state",
      description: "Roster and current goal contract for this room.",
    },
    async () => ({
      content: [
        {
          type: "text",
          // Always stated, even when false: this is the field `room append`
          // needs to stop hedging its refusal, so "no dispatcher" has to be an
          // answer rather than an absence.
          text: JSON.stringify(
            getStateTool(logPath, { dispatcherAttached: options.onOwnerCommand !== undefined }),
          ),
        },
      ],
    }),
  );

  server.registerTool(
    "room.get_transcript",
    {
      title: "Room transcript delta",
      description:
        "Messages with seq greater than since_seq, in order — at most `limit` of them. " +
        "The result carries has_more and next_seq so a page can be told from a complete answer: " +
        "pass next_seq back as since_seq to continue.",
      inputSchema: {
        since_seq: z.number().int().min(0),
        limit: z.number().int().min(0).optional(),
      },
    },
    async ({ since_seq, limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            limit === undefined
              ? getTranscriptTool(logPath, since_seq)
              : getTranscriptTool(logPath, since_seq, limit),
          ),
        },
      ],
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

  server.registerTool(
    "room.post_owner_command",
    {
      title: "Post an owner command",
      description:
        "Hands a veto / constraint / add_participant / goal_edit to the dispatcher. Never writes to the room log itself.",
      inputSchema: {
        kind: z.enum(OWNER_COMMAND_KINDS),
        body: z.string().min(1),
      },
    },
    async ({ kind, body }) => {
      const result: OwnerCommandResult = options.onOwnerCommand
        ? await options.onOwnerCommand({ kind, body })
        : {
            accepted: false,
            reason:
              "No dispatcher is attached to this server, so there is nothing to act on the command. A room served by `roomyx serve` alone is read-only; owner commands need the orchestrator that runs the room to embed this server and handle them.",
          };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  return server;
}
