import { TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { MessageEnvelope } from "../../log/types";

/** One chat message as its own Renderable row (see roster-sidebar.ts's header comment for why per-row, not one blob). */
export function createMessageRow(ctx: RenderContext, message: MessageEnvelope, fromName: string): TextRenderable {
  return new TextRenderable(ctx, {
    content: `${fromName}: ${message.body}`,
    height: 1,
  });
}
