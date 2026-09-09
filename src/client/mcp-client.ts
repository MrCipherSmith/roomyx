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
  /**
   * The server answered, and the answer was an error. Distinct from a
   * connection change on purpose: the room is reachable and the poll loop keeps
   * running, so reporting this as a disconnect told the operator to check the
   * network when the actual problem — usually a malformed line in their log —
   * was named in text that was being thrown away.
   */
  onToolError?(message: string): void;
}

/**
 * The server replied and the reply was an error. Carries the server's own text,
 * which used to be discarded: `callTool` ran `JSON.parse` over it, the parse
 * threw, and both poll loops caught it as a lost connection.
 */
export class ToolError extends Error {}

/** Reconnect delay ceiling. Without one, a persistent fault polls forever at 1s. */
const MAX_BACKOFF_MS = 30_000;

/**
 * Ends a session on the server as well as locally.
 *
 * `client.close()` aborts the local controller and tells the server nothing.
 * `terminateSession()` is what sends the HTTP DELETE the server needs to drop
 * its transport — and it had no callers anywhere, so every connect this client
 * ever made left a session behind that the room server retained for its whole
 * life, and that stayed a fully routable handle to the room.
 */
async function endSession(
  client: Client | undefined,
  transport: StreamableHTTPClientTransport | undefined,
): Promise<void> {
  await transport?.terminateSession().catch(() => undefined);
  await client?.close().catch(() => undefined);
}

/**
 * Polls a roomyx MCP server over HTTP for state and transcript updates.
 * Deliberately polling, not a push subscription — mirrors the server's own
 * "re-read on every call, no fs-watch" simplicity (see roomyx/README.md).
 * Tracks `since_seq` locally so a reconnect never re-delivers old messages.
 */
export class RoomClient {
  private readonly url: string;
  private readonly stateIntervalMs: number;
  private readonly transcriptIntervalMs: number;
  private readonly events: RoomClientEvents;

  private client: Client | undefined;
  private transport: StreamableHTTPClientTransport | undefined;
  private status: ConnectionStatus = "connecting";
  private sinceSeq = 0;
  private stopped = false;
  private stateTimer: ReturnType<typeof setTimeout> | undefined;
  private transcriptTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private backoffMs: number;
  /**
   * Bumped on every disconnect. Each poll loop captures the generation it was
   * started under and exits silently once it is stale.
   *
   * Without it, one dropped connection produced two: `handleDisconnect` was
   * reachable independently from both loops, each scheduled its own
   * `connect()`, and each `connect()` started a *fresh* pair of loops without
   * stopping the running ones — so the loop count doubled per fault. Measured
   * from a single malformed log line: one connection became 510 in ten seconds.
   */
  private generation = 0;

  constructor(options: RoomClientOptions, events: RoomClientEvents) {
    this.url = options.url;
    this.stateIntervalMs = options.stateIntervalMs ?? 3000;
    this.transcriptIntervalMs = options.transcriptIntervalMs ?? 1000;
    this.backoffMs = this.transcriptIntervalMs;
    this.events = events;
  }

  start(): void {
    this.stopped = false;
    this.scheduleConnect(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.generation += 1;
    clearTimeout(this.stateTimer);
    clearTimeout(this.transcriptTimer);
    clearTimeout(this.reconnectTimer);
    await endSession(this.client, this.transport);
    this.client = undefined;
    this.transport = undefined;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.events.onConnectionChange?.(status);
  }

  /**
   * Single-flight: a reconnect already pending is not scheduled again, and the
   * handle is kept so `stop()` can cancel it. Both were missing — the timer was
   * discarded, so nothing could tell that a reconnect was already on its way.
   */
  private scheduleConnect(delayMs: number): void {
    if (this.stopped || this.reconnectTimer !== undefined) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delayMs);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setStatus("connecting");
    try {
      const client = new Client({ name: "roomyx-client", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(this.url));
      await client.connect(transport);
      if (this.stopped) {
        // stop() ran while this connection was in flight; this.client was
        // still undefined for it to close, so close the one it never saw.
        await endSession(client, transport);
        return;
      }
      // Close whatever we were holding before replacing it. A reconnect used
      // to drop the previous Client on the floor, leaking its socket.
      const previous = this.client;
      const previousTransport = this.transport;
      this.client = client;
      this.transport = transport;
      if (previous) void endSession(previous, previousTransport);

      this.backoffMs = this.transcriptIntervalMs;
      this.setStatus("connected");
      const generation = this.generation;
      this.pollState(generation);
      this.pollTranscript(generation);
    } catch {
      this.setStatus("disconnected");
      this.scheduleConnect(this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    }
  }

  /**
   * Sends an owner command to the room's dispatcher. Not a write to the log —
   * the server forwards it and answers with whatever the dispatcher said,
   * including `accepted: false` when no dispatcher is attached at all.
   */
  async postOwnerCommand(kind: string, body: string): Promise<{ accepted: boolean; reason?: string }> {
    return this.callTool<{ accepted: boolean; reason?: string }>("room.post_owner_command", { kind, body });
  }

  private async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!this.client) throw new Error("not connected");
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text: string }> | undefined;
    const text = content?.[0]?.text;

    // `isError` was never read, so a tool-level failure arrived as prose that
    // `JSON.parse` then choked on — indistinguishable, to the caller, from the
    // transport dropping.
    if (result.isError === true) throw new ToolError(text ?? `${name} failed with no message`);
    if (text === undefined) throw new ToolError(`${name} returned no content`);

    try {
      return JSON.parse(text) as T;
    } catch {
      // Not an error result, but not JSON either. Still the server's answer,
      // not a lost connection.
      throw new ToolError(`${name} returned a response that is not JSON: ${text.slice(0, 200)}`);
    }
  }

  /**
   * A tool error leaves the loop running: the room is reachable, the poll can
   * be retried, and the operator gets the server's own text instead of a
   * connection diagnosis that is simply wrong.
   */
  private handleToolError(error: unknown, resume: () => void): boolean {
    if (!(error instanceof ToolError)) return false;
    this.events.onToolError?.(error.message);
    resume();
    return true;
  }

  private pollState(generation: number): void {
    if (this.isStale(generation)) return;
    const again = () => {
      this.stateTimer = setTimeout(() => this.pollState(generation), this.stateIntervalMs);
    };
    this.callTool<RoomState>("room.get_state", {})
      .then((state) => {
        if (this.isStale(generation)) return;
        this.events.onStateUpdate?.(state);
        again();
      })
      .catch((error: unknown) => {
        if (this.isStale(generation)) return;
        if (this.handleToolError(error, again)) return;
        this.handleDisconnect();
      });
  }

  private pollTranscript(generation: number): void {
    if (this.isStale(generation)) return;
    const again = () => {
      this.transcriptTimer = setTimeout(() => this.pollTranscript(generation), this.transcriptIntervalMs);
    };
    this.callTool<MessageEnvelope[]>("room.get_transcript", { since_seq: this.sinceSeq })
      .then((messages) => {
        if (this.isStale(generation)) return;
        if (messages.length > 0) {
          this.sinceSeq = Math.max(this.sinceSeq, ...messages.map((m) => m.seq));
          this.events.onNewMessages?.(messages);
        }
        again();
      })
      .catch((error: unknown) => {
        if (this.isStale(generation)) return;
        if (this.handleToolError(error, again)) return;
        this.handleDisconnect();
      });
  }

  /** Stopped, or superseded by a later connection. */
  private isStale(generation: number): boolean {
    return this.stopped || generation !== this.generation;
  }

  private handleDisconnect(): void {
    if (this.stopped) return;
    // Bumping the generation is what stops the sibling loop, which clearing a
    // single-slot timer handle could not: after the first doubling the handle
    // belonged to a different, still-healthy loop.
    this.generation += 1;
    clearTimeout(this.stateTimer);
    clearTimeout(this.transcriptTimer);
    const previous = this.client;
    const previousTransport = this.transport;
    this.client = undefined;
    this.transport = undefined;
    if (previous) void endSession(previous, previousTransport);
    this.setStatus("disconnected");
    this.scheduleConnect(this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }
}
