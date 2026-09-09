import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MessageEnvelope, RoomState } from "../log/types";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface RoomClientOptions {
  url: string;
  /** How often to poll room.get_state. Roster/goal contract change rarely. */
  stateIntervalMs?: number;
  /** How often to poll room.get_transcript. */
  transcriptIntervalMs?: number;
}

export interface RoomClientEvents {
  onStateUpdate?(state: RoomState): void;
  onNewMessages?(messages: MessageEnvelope[]): void;
  onConnectionChange?(status: ConnectionStatus): void;
}

/**
 * Polls a room-tui MCP server over HTTP for state and transcript updates.
 * Deliberately polling, not a push subscription — mirrors the server's own
 * "re-read on every call, no fs-watch" simplicity (see room-tui/README.md).
 * Tracks `since_seq` locally so a reconnect never re-delivers old messages.
 */
export class RoomClient {
  private readonly url: string;
  private readonly stateIntervalMs: number;
  private readonly transcriptIntervalMs: number;
  private readonly events: RoomClientEvents;

  private client: Client | undefined;
  private status: ConnectionStatus = "connecting";
  private sinceSeq = 0;
  private stopped = false;
  private stateTimer: ReturnType<typeof setTimeout> | undefined;
  private transcriptTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: RoomClientOptions, events: RoomClientEvents) {
    this.url = options.url;
    this.stateIntervalMs = options.stateIntervalMs ?? 3000;
    this.transcriptIntervalMs = options.transcriptIntervalMs ?? 1000;
    this.events = events;
  }

  start(): void {
    this.stopped = false;
    this.scheduleConnect(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.stateTimer);
    clearTimeout(this.transcriptTimer);
    await this.client?.close().catch(() => undefined);
    this.client = undefined;
  }

  getLastSeenSeq(): number {
    return this.sinceSeq;
  }

  /** On-demand call for the agent modal — not part of the poll loop. */
  async getAgentDetail(agentId: string): Promise<import("../log/types").AgentDetail> {
    return this.callTool("room.get_agent_detail", { agent_id: agentId });
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.events.onConnectionChange?.(status);
  }

  private scheduleConnect(delayMs: number): void {
    if (this.stopped) return;
    setTimeout(() => {
      void this.connect();
    }, delayMs);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setStatus("connecting");
    try {
      const client = new Client({ name: "room-tui-client", version: "0.1.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(this.url)));
      if (this.stopped) {
        // stop() ran while this connection was in flight; this.client was
        // still undefined for it to close, so close the one it never saw.
        await client.close().catch(() => undefined);
        return;
      }
      this.client = client;
      this.setStatus("connected");
      this.pollState();
      this.pollTranscript();
    } catch {
      this.setStatus("disconnected");
      this.scheduleConnect(this.transcriptIntervalMs);
    }
  }

  private async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!this.client) throw new Error("not connected");
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text: string }>;
    return JSON.parse(content[0]?.text ?? "null") as T;
  }

  private pollState(): void {
    if (this.stopped) return;
    this.callTool<RoomState>("room.get_state", {})
      .then((state) => {
        if (this.stopped) return;
        this.events.onStateUpdate?.(state);
        this.stateTimer = setTimeout(() => this.pollState(), this.stateIntervalMs);
      })
      .catch(() => {
        if (this.stopped) return;
        this.handleDisconnect();
      });
  }

  private pollTranscript(): void {
    if (this.stopped) return;
    this.callTool<MessageEnvelope[]>("room.get_transcript", { since_seq: this.sinceSeq })
      .then((messages) => {
        if (this.stopped) return;
        if (messages.length > 0) {
          this.sinceSeq = Math.max(this.sinceSeq, ...messages.map((m) => m.seq));
          this.events.onNewMessages?.(messages);
        }
        this.transcriptTimer = setTimeout(() => this.pollTranscript(), this.transcriptIntervalMs);
      })
      .catch(() => {
        if (this.stopped) return;
        this.handleDisconnect();
      });
  }

  private handleDisconnect(): void {
    if (this.stopped) return;
    clearTimeout(this.stateTimer);
    clearTimeout(this.transcriptTimer);
    this.setStatus("disconnected");
    this.scheduleConnect(this.transcriptIntervalMs);
  }
}
