import { BoxRenderable, ScrollBoxRenderable, TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { GoalContract, MessageEnvelope, RosterEntry } from "../../log/types";
import { StatusBar } from "../components/status-bar";
import { RosterSidebar } from "../components/roster-sidebar";
import { Footer } from "../components/footer";
import { createMessageRow } from "../components/message-row";
import type { ConnectionStatus } from "../mcp-client";

/**
 * Terminal width at or above which the roster gets its 24 columns. Below it,
 * those columns are worth more to the transcript than to a list of names.
 */
export const ROSTER_BREAKPOINT = 80;

/**
 * Main screen: StatusBar on top, RosterSidebar on the left, a scrolling
 * message stream on the right, Footer along the bottom.
 */
export class ChatView {
  readonly node: BoxRenderable;
  readonly statusBar: StatusBar;
  readonly roster: RosterSidebar;
  readonly footer: Footer;
  private readonly scroll: ScrollBoxRenderable;
  private readonly ctx: RenderContext;
  private rosterById = new Map<string, RosterEntry>();
  private lastSpeaker: string | null = null;
  private readonly rosterVisible: boolean;

  constructor(ctx: RenderContext, options: { width: number; height: number; onSelectAgent?: (agent: RosterEntry) => void }) {
    this.ctx = ctx;
    this.node = new BoxRenderable(ctx, { width: options.width, height: options.height, flexDirection: "column" });
    this.statusBar = new StatusBar(ctx);
    this.node.add(this.statusBar.node);

    const body = new BoxRenderable(ctx, { flexDirection: "row", flexGrow: 1 });
    this.node.add(body);

    // Below the breakpoint the roster is hidden and the stream takes the whole
    // width. At 72 columns the roster was spending a third of the terminal on
    // three short names while the messages wrapped to 46 — and a fixed
    // 24-column gutter is also where non-Latin names die, since three CJK
    // characters are six cells and not three.
    //
    // A breakpoint rather than a hard minimum, and auto rather than a flag:
    // atuin degrades its own layout on a short terminal the same way, and
    // charm's crush hides its sidebar below 120x30 outright. The participants
    // are still reachable — the footer says how many there are, and widening
    // the terminal brings the list back.
    this.rosterVisible = options.width >= ROSTER_BREAKPOINT;
    this.roster = new RosterSidebar(ctx, { width: 24, onSelect: options.onSelectAgent });
    if (this.rosterVisible) body.add(this.roster.node);

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

    this.footer = new Footer(ctx, { width: options.width });
    this.node.add(this.footer.node);
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
      // Consecutive turns from one speaker share a header. `long.png` had the
      // same nine-character prefix nine times running, which reads as noise
      // and hides the one thing a header is for — telling you the speaker
      // changed.
      const sameSpeaker = this.lastSpeaker === message.from;
      this.scroll.add(
        createMessageRow(this.ctx, message, fromName, {
          showHeader: !sameSpeaker,
          separate: this.lastSpeaker !== null,
        }),
      );
      this.lastSpeaker = message.from;
    }
  }

  /**
   * A state change written into the transcript itself, not only into the
   * footer. A footer is repainted at a fixed row with the cursor parked
   * elsewhere, so a screen reader never speaks it and a `tee`'d session never
   * records it — it is invisible in exactly the way that matters. A line in
   * the stream lands in speech, in scrollback and in the log at once.
   */
  appendSystemLine(text: string): void {
    this.scroll.add(new TextRenderable(this.ctx, { content: `— ${text} —`, wrapMode: "word", marginTop: 1 }));
    // The run of one speaker is broken by anything that comes between, so the
    // next message re-states who is talking.
    this.lastSpeaker = null;
  }

  /** False on a terminal too narrow to justify the 24-column gutter. */
  isRosterVisible(): boolean {
    return this.rosterVisible;
  }

  /** True when the reader is parked at the newest message. */
  isAtBottom(): boolean {
    return this.scroll.scrollTop >= this.maxScrollTop() - 1;
  }

  scrollByLines(lines: number): void {
    this.scroll.scrollTop = Math.max(0, Math.min(this.maxScrollTop(), this.scroll.scrollTop + lines));
  }

  scrollToTop(): void {
    this.scroll.scrollTop = 0;
  }

  scrollToBottom(): void {
    this.scroll.scrollTop = this.maxScrollTop();
  }

  /** Viewport height in rows, for page-sized movement. */
  pageSize(): number {
    return Math.max(1, this.scroll.viewport.height);
  }

  private maxScrollTop(): number {
    return Math.max(0, this.scroll.scrollHeight - this.scroll.viewport.height);
  }
}
