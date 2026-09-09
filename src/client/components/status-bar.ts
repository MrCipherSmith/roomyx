import { TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { ConnectionStatus } from "../mcp-client";
import type { GoalContract } from "../../log/types";

/** One-line status bar: goal statement + connection status. */
export class StatusBar {
  readonly node: TextRenderable;
  private goalStatement = "";
  private status: ConnectionStatus = "connecting";
  /** Takes over the line while an owner command is being composed or answered. */
  private notice: string | null = null;

  constructor(ctx: RenderContext) {
    // Same reason as the roster rows: with the default word wrapping, an
    // over-long line went to a second row that `height: 1` clipped, taking the
    // whole trailing word with it. This line carries the goal statement and
    // every owner-command result, including the reason an export failed.
    this.node = new TextRenderable(ctx, { content: "", height: 1, wrapMode: "none" });
    this.render();
  }

  setGoalContract(goal: GoalContract): void {
    this.goalStatement = goal.goal_statement;
    this.render();
  }

  setConnectionStatus(status: ConnectionStatus): void {
    this.status = status;
    this.render();
  }

  /** Pass null to hand the line back to the goal statement. */
  setNotice(notice: string | null): void {
    this.notice = notice;
    this.render();
  }

  private render(): void {
    if (this.notice !== null) {
      this.node.content = this.notice;
      return;
    }
    const statusLabel = { connecting: "connecting…", connected: "connected", disconnected: "disconnected — retrying" }[
      this.status
    ];
    this.node.content = `[${statusLabel}] ${this.goalStatement}`;
  }
}
