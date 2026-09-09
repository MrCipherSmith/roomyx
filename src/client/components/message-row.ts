import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { MessageEnvelope } from "../../log/types";

/**
 * One chat message: a header line naming the speaker, and the body indented
 * under it.
 *
 * It used to be a single `Name: body` line, wrapped, in one colour and one
 * weight. Sixteen of those is a grey wall — a continuation line and a new turn
 * are indistinguishable, and nine consecutive turns from one speaker repeat
 * the same nine-character prefix while telling you nothing. The indent is what
 * makes a wrapped line read as a continuation instead of as a new turn.
 *
 * Two earlier defects this file carried, kept written down because both were
 * invisible from the code: `height: 1` with the default `wrapMode: "none"`
 * clipped every message at the pane width — in a room of arguing agents that
 * is most of them, and the part that got cut was the end, where the claim
 * usually is. And `kind` / `in_reply_to` were written by the dispatcher and
 * rendered by nothing, so the challenge/answer structure that is the point of
 * the log schema was visible in the log and invisible in the viewer of it.
 *
 * The tag stays ASCII on purpose: `↩` and `→` are East-Asian-ambiguous, so
 * their width depends on the reader's terminal, and a wrong guess shifts the
 * whole wrapped row.
 */
export const SPEAKER_FG = "#ffffff";
export const TAG_FG = "#8a8a8a";
export const BODY_FG = "#c6c6c6";

export interface MessageRowOptions {
  /**
   * False when the previous message was from the same speaker — the body then
   * joins the turn above it instead of repeating a header nobody reads.
   */
  showHeader: boolean;
  /** False for the first row, which needs no separating blank line above it. */
  separate: boolean;
}

function tagFor(message: MessageEnvelope): string {
  return [message.kind, message.in_reply_to === undefined ? null : `re #${message.in_reply_to}`]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

export function createMessageRow(
  ctx: RenderContext,
  message: MessageEnvelope,
  fromName: string,
  options: MessageRowOptions = { showHeader: true, separate: false },
): BoxRenderable {
  const row = new BoxRenderable(ctx, {
    flexDirection: "column",
    marginTop: options.separate ? 1 : 0,
  });

  if (options.showHeader) {
    const header = new BoxRenderable(ctx, { flexDirection: "row", height: 1 });
    header.add(new TextRenderable(ctx, { content: fromName, fg: SPEAKER_FG, attributes: 1, height: 1 }));
    const tag = tagFor(message);
    if (tag) header.add(new TextRenderable(ctx, { content: `  ${tag}`, fg: TAG_FG, height: 1 }));
    row.add(header);
  }

  row.add(
    new TextRenderable(ctx, {
      content: message.body,
      fg: BODY_FG,
      wrapMode: "word",
      marginLeft: 2,
    }),
  );

  return row;
}
