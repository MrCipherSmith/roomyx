import { TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { MessageEnvelope } from "../../log/types";

/**
 * One chat message as its own Renderable row (see roster-sidebar.ts's header
 * comment for why per-row, not one blob).
 *
 * Two things this used to drop on the floor, both found by reading a real room
 * in the TUI and comparing it against the same room's JSONL:
 *
 * - `height: 1` with the default `wrapMode: "none"` truncated every message at
 *   the pane width. In a room of arguing agents that is most of them, and the
 *   part that gets cut is the end — where the actual claim usually is. There is
 *   no horizontal scroll to recover it either, which is what makes this a loss
 *   rather than an inconvenience.
 * - `kind` and `in_reply_to` are in `MessageEnvelope` and written by the
 *   dispatcher, and nothing ever displayed them. A room's structure — who is
 *   answering whom, which lines are votes — was in the log and not on screen.
 *
 * The prefix stays ASCII on purpose: `↩` and `→` are East-Asian-ambiguous, so
 * their width depends on the reader's terminal, and a wrong guess shifts the
 * whole wrapped row.
 */
export function createMessageRow(ctx: RenderContext, message: MessageEnvelope, fromName: string): TextRenderable {
  const tags = [message.kind, message.in_reply_to === undefined ? null : `re #${message.in_reply_to}`]
    .filter((tag): tag is string => Boolean(tag))
    .join(" ");

  return new TextRenderable(ctx, {
    content: `${fromName}${tags ? ` [${tags}]` : ""}: ${message.body}`,
    wrapMode: "word",
  });
}
