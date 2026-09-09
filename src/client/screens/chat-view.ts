import { BoxRenderable, ScrollBoxRenderable, TextRenderable } from "@opentui/core";
import type { Renderable, RenderContext } from "@opentui/core";
import type { GoalContract, MessageEnvelope, RosterEntry } from "../../log/types";
import { StatusBar } from "../components/status-bar";
import { RosterSidebar } from "../components/roster-sidebar";
import { Footer } from "../components/footer";
import { HelpOverlay } from "../components/help-overlay";
import { createMessageRow } from "../components/message-row";
import { Transcript } from "../transcript";
import type { Entry } from "../transcript";
import type { ConnectionStatus } from "../mcp-client";

/**
 * Terminal width at or above which the roster gets its 24 columns. Below it,
 * those columns are worth more to the transcript than to a list of names.
 */
export const ROSTER_BREAKPOINT = 80;

/**
 * Main screen: StatusBar on top, RosterSidebar on the left, a scrolling
 * message stream on the right, Footer along the bottom, help overlay on top of
 * everything when asked for.
 *
 * The view renders from a `Transcript` rather than owning its messages, which
 * is what makes filtering and searching possible at all — it used to push
 * renderables into the scroll box and keep no record of what it had drawn, so
 * there was nothing to filter and nothing to search.
 */
export class ChatView {
  readonly node: BoxRenderable;
  readonly statusBar: StatusBar;
  readonly roster: RosterSidebar;
  readonly footer: Footer;
  readonly help: HelpOverlay;
  readonly transcript = new Transcript();
  private readonly scroll: ScrollBoxRenderable;
  private readonly ctx: RenderContext;
  private rosterById = new Map<string, RosterEntry>();
  private rows: Renderable[] = [];
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

    this.help = new HelpOverlay(ctx, { width: options.width, height: options.height });
    this.node.add(this.help.node);
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
      this.appendEntry({
        kind: "message",
        message,
        fromName: this.rosterById.get(message.from)?.name ?? message.from,
      });
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
    this.appendEntry({ kind: "system", text });
  }

  /** Null clears the filter and brings the whole room back. */
  setFilter(participantId: string | null): void {
    this.transcript.setFilter(participantId);
    this.rebuild();
  }

  /** Empty clears the search. */
  setQuery(query: string): void {
    this.transcript.setQuery(query);
  }

  /** Puts the entry at `index` in the transcript's visible list at the top of the viewport. */
  scrollToEntry(index: number): void {
    const row = this.rows[index];
    if (row === undefined) return;
    const offset = row.y - this.scroll.content.y;
    this.scroll.scrollTop = Math.max(0, Math.min(this.maxScrollTop(), offset));
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

  private appendEntry(entry: Entry): void {
    const before = this.transcript.visible().length;
    this.transcript.append(entry);
    const after = this.transcript.visible();
    // Appending stays incremental while the new entry is visible under the
    // current filter, and touches nothing when it is not. Rebuilding the whole
    // pane on every poll would recreate every row in the room once a second.
    if (after.length === before + 1) this.addRow(after.length - 1);
  }

  private addRow(index: number): void {
    const entry = this.transcript.visible()[index];
    if (entry === undefined) return;

    const separate = index > 0;
    const row =
      entry.kind === "system"
        ? new TextRenderable(this.ctx, {
            content: `— ${entry.text} —`,
            wrapMode: "word",
            marginTop: separate ? 1 : 0,
          })
        : createMessageRow(this.ctx, entry.message, entry.fromName, {
            // Consecutive turns from one speaker share a header. A real room
            // had the same nine-character prefix nine times running, which
            // hides the one thing a header is for: telling you the speaker
            // changed.
            showHeader: this.transcript.startsRun(index),
            separate,
          });

    this.rows.push(row);
    this.scroll.add(row);
  }

  private rebuild(): void {
    for (const row of this.rows) this.scroll.remove(row);
    this.rows = [];
    const count = this.transcript.visible().length;
    for (let index = 0; index < count; index += 1) this.addRow(index);
  }

  private maxScrollTop(): number {
    return Math.max(0, this.scroll.scrollHeight - this.scroll.viewport.height);
  }
}
