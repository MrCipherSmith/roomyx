import { BoxRenderable, ScrollBoxRenderable, TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import { createMessageRow } from "../components/message-row";
import type { AgentDetail } from "../../log/types";

/**
 * Modal overlay for one participant's own messages (R4 / AC2 — shows only
 * that participant's data, not the full transcript). Drawn over the chat
 * view, not a screen replacement, matching the pattern observed in keryx's
 * own mcp-inspector.ts (background stays visible, modal on top).
 */
export class AgentModal {
  readonly node: BoxRenderable;
  private readonly title: TextRenderable;
  private readonly scroll: ScrollBoxRenderable;
  private readonly ctx: RenderContext;

  constructor(ctx: RenderContext, options: { width: number; height: number }) {
    this.ctx = ctx;
    this.node = new BoxRenderable(ctx, {
      width: options.width,
      height: options.height,
      flexDirection: "column",
      border: true,
      visible: false,
      position: "absolute",
      top: 2,
      left: 2,
      zIndex: 10,
      backgroundColor: "#000000",
    });
    this.title = new TextRenderable(ctx, { content: "", height: 1 });
    this.node.add(this.title);
    this.scroll = new ScrollBoxRenderable(ctx, { flexGrow: 1 });
    this.node.add(this.scroll);
  }

  show(detail: AgentDetail): void {
    for (const child of this.scroll.getChildren()) this.scroll.remove(child);
    if (!detail.found) {
      this.title.content = "Agent not found";
      this.node.visible = true;
      return;
    }
    this.title.content = `${detail.agent.name} — last seen at seq ${detail.lastSeenSeq}`;
    for (const message of detail.messages) {
      this.scroll.add(createMessageRow(this.ctx, message, detail.agent.name));
    }
    this.node.visible = true;
  }

  hide(): void {
    this.node.visible = false;
  }

  isVisible(): boolean {
    return this.node.visible;
  }
}
