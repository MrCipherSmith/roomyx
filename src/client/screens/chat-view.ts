import { BoxRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { GoalContract, MessageEnvelope, RosterEntry } from "../../log/types";
import { StatusBar } from "../components/status-bar";
import { RosterSidebar } from "../components/roster-sidebar";
import { createMessageRow } from "../components/message-row";
import type { ConnectionStatus } from "../mcp-client";

/**
 * Main screen: StatusBar on top, RosterSidebar on the left, a scrolling
 * message stream on the right. Uses ScrollBoxRenderable's built-in
 * `stickyScroll`/`stickyStart: "bottom"` for AC8 (don't yank the view when
 * the user has scrolled up to read history) instead of hand-rolling
 * scroll-position math.
 */
export class ChatView {
  readonly node: BoxRenderable;
  readonly statusBar: StatusBar;
  readonly roster: RosterSidebar;
  private readonly scroll: ScrollBoxRenderable;
  private readonly ctx: RenderContext;
  private rosterById = new Map<string, RosterEntry>();

  constructor(ctx: RenderContext, options: { width: number; height: number; onSelectAgent?: (agent: RosterEntry) => void }) {
    this.ctx = ctx;
    this.node = new BoxRenderable(ctx, { width: options.width, height: options.height, flexDirection: "column" });
    this.statusBar = new StatusBar(ctx);
    this.node.add(this.statusBar.node);

    const body = new BoxRenderable(ctx, { flexDirection: "row", flexGrow: 1 });
    this.node.add(body);

    this.roster = new RosterSidebar(ctx, { width: 24, onSelect: options.onSelectAgent });
    body.add(this.roster.node);

    // `horizontalScrollbarOptions: { visible: false }` is the whole fix for
    // the first message vanishing. The horizontal scrollbar occupies a
    // viewport row whether or not it has anything to scroll, which leaves
    // `maxScrollTop` at 1 on a pane that is not full — so sticky-bottom
    // scrolls down by one and takes seq 1 with it. Found by bisection rather
    // than by reading: `scrollX: false` and the `contentOptions` variants were
    // measured and do nothing.
    //
    // Nothing here scrolls horizontally anyway; message bodies wrap.
    this.scroll = new ScrollBoxRenderable(ctx, {
      flexGrow: 1,
      stickyScroll: true,
      stickyStart: "bottom",
      horizontalScrollbarOptions: { visible: false },
    });
    body.add(this.scroll);
  }

  setConnectionStatus(status: ConnectionStatus): void {
    this.statusBar.setConnectionStatus(status);
  }

  setGoalContract(goal: GoalContract): void {
    this.statusBar.setGoalContract(goal);
  }

  setRoster(roster: RosterEntry[]): void {
    this.rosterById = new Map(roster.map((agent) => [agent.id, agent]));
    this.roster.setRoster(roster);
  }

  appendMessages(messages: MessageEnvelope[]): void {
    for (const message of messages) {
      const fromName = this.rosterById.get(message.from)?.name ?? message.from;
      this.scroll.add(createMessageRow(this.ctx, message, fromName));
    }
  }
}
