import { TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import { clip } from "../clip";
import type { ConnectionStatus } from "../mcp-client";
import type { GoalContract } from "../../log/types";

/**
 * One-line status bar: goal statement + connection status.
 *
 * `"closed"` is a display state, not a transport state — a room being reread
 * from its log has no socket at all. It is widened here rather than added to
 * `ConnectionStatus`, which describes what the MCP client is doing and would
 * then carry a member the client can never emit.
 */
export type DisplayStatus = ConnectionStatus | "closed";
export class StatusBar {
  readonly node: TextRenderable;
  private goalStatement = "";
  /** The number the room exists to cross. Empty when the goal states none. */
  private threshold = "";
  private status: DisplayStatus = "connecting";
  private readonly width: number;
  /** Takes over the line while an owner command is being composed or answered. */
  private notice: string | null = null;

  constructor(ctx: RenderContext, options: { width: number }) {
    this.width = options.width;
    // Same reason as the roster rows: with the default word wrapping, an
    // over-long line went to a second row that `height: 1` clipped, taking the
    // whole trailing word with it. This line carries the goal statement and
    // every owner-command result, including the reason an export failed.
    this.node = new TextRenderable(ctx, { content: "", height: 1, wrapMode: "none" });
    this.render();
  }

  setGoalContract(goal: GoalContract): void {
    this.goalStatement = goal.goal_statement;
    // R12: the room is goal-driven, and the goal is a number to cross. Showing
    // the statement without the number left the reader unable to tell how close
    // the room was, in the one line that has room to say it. A goal that states
    // no threshold gets no invented one.
    this.threshold =
      goal.threshold.pass_at_or_above > 0 ? `  ·  pass ≥${goal.threshold.pass_at_or_above}` : "";
    this.render();
  }

  setConnectionStatus(status: DisplayStatus): void {
    this.status = status;
    this.render();
  }

  /** Pass null to hand the line back to the goal statement. */
  setNotice(notice: string | null): void {
    this.notice = notice;
    this.render();
  }

  private render(): void {
    // Clipped rather than cut by the pane edge. `wrapMode: "none"` on a
    // `height: 1` row means anything longer vanished mid-word with nothing to
    // say it had been cut — a truncated goal read as a short goal, and a real
    // vet o's refusal stopped at "…the command. A" (R12, widened 2026-09-09).
    // The client's own cutter is used rather than a second one written here.
    if (this.notice !== null) {
      this.node.content = clip(this.notice, this.width);
      return;
    }
    const statusLabel = {
      connecting: "connecting…",
      connected: "connected",
      disconnected: "disconnected — retrying",
      closed: "closed",
    }[this.status];
    this.node.content = clip(`[${statusLabel}] ${this.goalStatement}${this.threshold}`, this.width);
  }
}
