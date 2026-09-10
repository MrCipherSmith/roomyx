import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStateTool } from "./tools/get-state";
import { OwnerCommandQueue } from "./owner-queue";
import { getTranscriptTool } from "./tools/get-transcript";
import { getAgentDetailTool } from "./tools/get-agent-detail";

export const OWNER_COMMAND_KINDS = ["veto", "constraint", "add_participant", "goal_edit"] as const;

export type OwnerCommandKind = (typeof OWNER_COMMAND_KINDS)[number];

export interface OwnerCommand {
  kind: OwnerCommandKind;
  body: string;
}

/**
 * A command as it reaches a dispatcher: the same two fields, plus the queue
 * entry's id.
 *
 * The id is what lets an embedded handler and a queue reader talk about the same
 * command — the handler can settle it, or name it in the log line it writes, and
 * the two roads meet at one identity instead of at a coincidence of body text.
 */
export interface OwnerCommandEnvelope extends OwnerCommand {
  id: string;
}

/**
 * What became of a posted command.
 *
 * `queued` is the third answer and the reason this is not a boolean: a command
 * held for a dispatcher that has not read it yet is **not** the same as a command
 * nothing will ever act on, and `accepted: false` used to mean both. It is also
 * the normal answer for a bare `roomyx serve`.
 */
export type OwnerCommandStatus = "queued" | "accepted" | "refused";

export interface OwnerCommandResult {
  /** The queue entry this command is, so a dispatcher can acknowledge exactly it. */
  id: string;
  status: OwnerCommandStatus;
  /** The dispatcher's own words, when one handled it. */
  reason?: string;
}

export interface RoomMcpServerOptions {
  /**
   * The room's owner-command queue, shared by every session.
   *
   * Optional so a unit test or an embedder can build a server on its own — but
   * a caller that wants a command posted in one session to be readable in
   * another MUST pass the same queue to both, which is what `serve()` does.
   * Omitting it gives this server a private queue, and a private queue is
   * invisible to every other client.
   */
  ownerQueue?: OwnerCommandQueue;
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
  /**
   * Supplied by a dispatcher that embeds this server. It is a **second road**
   * into the same queue, not a parallel one: the command is held either way, and
   * a handler that answers settles the entry so that whoever reads the queue
   * does not act on it twice.
   */
  onOwnerCommand?: (
    command: OwnerCommandEnvelope,
  ) =>
    | { status: Exclude<OwnerCommandStatus, "queued">; reason?: string }
    | Promise<{ status: Exclude<OwnerCommandStatus, "queued">; reason?: string }>;
}

/**
 * Builds the roomyx MCP server for a given room log file. Nothing here writes
 * to `logPath` — not the three read tools (R2-R4, AC4), and not
 * `room.post_owner_command`, which only forwards to the dispatcher (R5, D-01).
 */
export function createRoomMcpServer(logPath: string, options: RoomMcpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "roomyx", version: "0.1.0" });
  // A private queue when nobody injected one. Correct for a unit test, wrong for
  // a room with more than one client — see the option's own comment.
  const queue = options.ownerQueue ?? new OwnerCommandQueue();

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
        "Hands a veto / constraint / add_participant / goal_edit to the room: it is held in the room's queue " +
        "for a dispatcher to read, and settlement is reported as `queued`, `accepted` or `refused`. " +
        "Never writes to the room log itself.",
      inputSchema: {
        kind: z.enum(OWNER_COMMAND_KINDS),
        body: z.string().min(1),
      },
    },
    async ({ kind, body }) => {
      // `OwnerQueueFullError` is thrown and the SDK turns it into an error
      // result: a full queue is a refusal with a diagnosis, not a success with a
      // caveat. `accepted: true` for a command that was dropped is the shape
      // this whole item exists to remove.
      const queued = queue.post(kind, body);

      if (options.onOwnerCommand) {
        // The handler is a dispatcher that embedded this server, so its verdict
        // is the answer — and it SETTLES the entry, because delivering the same
        // veto twice (once to the handler, once to whoever reads the queue) is
        // worse than one delivery to a stub the embedder wrote itself.
        const verdict = await options.onOwnerCommand({ kind, body, id: queued.id });
        queue.ack(queued.id);
        const settled: OwnerCommandResult = { id: queued.id, status: verdict.status };
        if (verdict.reason !== undefined) settled.reason = verdict.reason;
        return { content: [{ type: "text", text: JSON.stringify(settled) }] };
      }

      const result: OwnerCommandResult = { id: queued.id, status: "queued" };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    "room.get_pending_owner_commands",
    {
      title: "Owner commands nobody has acted on",
      description:
        "Commands posted by the owner that have not been acknowledged yet, oldest first. " +
        "Read-only: the room log is still written only by the dispatcher.",
    },
    async () => ({ content: [{ type: "text", text: JSON.stringify(queue.list()) }] }),
  );

  server.registerTool(
    "room.ack_owner_command",
    {
      title: "Acknowledge an owner command",
      description:
        "Says that a command has been dealt with, so `pending` keeps meaning something. " +
        "An unknown or already-acknowledged id is refused rather than reported as success.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      if (!queue.ack(id)) {
        // Thrown, not returned: the SDK turns this into an error result, and a
        // dispatcher told "acknowledged" about a command it never held would
        // stop looking for it.
        throw new Error(`No pending owner command with id "${id}".`);
      }
      return { content: [{ type: "text", text: JSON.stringify({ acked: true, id }) }] };
    },
  );

  server.registerResource(
    "owner-queue",
    "room://owner-queue",
    {
      title: "Owner command queue",
      description: "The same pending commands as room.get_pending_owner_commands, as a resource.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(queue.list()) }],
    }),
  );

  return server;
}
