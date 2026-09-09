import { TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { ConnectionStatus } from "../mcp-client";
import type { GoalContract } from "../../log/types";

/** One-line status bar: goal statement + connection status. */
export class StatusBar {
  readonly node: TextRenderable;
  private goalStatement = "";
  private status: ConnectionStatus = "connecting";

  constructor(ctx: RenderContext) {
    this.node = new TextRenderable(ctx, { content: "", height: 1 });
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

  private render(): void {
    const statusLabel = { connecting: "connecting…", connected: "connected", disconnected: "disconnected — retrying" }[
      this.status
    ];
    this.node.content = `[${statusLabel}] ${this.goalStatement}`;
  }
}
