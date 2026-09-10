import { existsSync, writeFileSync } from "node:fs";
import type { CliRenderer, ParsedKey } from "@opentui/core";
import { ChatView } from "./screens/chat-view";
import type { RosterEntry } from "../log/types";
import { resolveAction } from "./keymap";
import type { Action } from "./keymap";
import { exportBaseName, nextFreeExportPath } from "./export-name";
import { CLOSED, opened, searchPromptLine, stepSearchPrompt } from "./search-prompt";
import type { SearchPromptState } from "./search-prompt";

/**
 * Everything the reader does that does not depend on the room being live:
 * scrolling, filtering by participant, searching, exporting, help, quitting.
 *
 * Extracted when the archive viewer arrived, because the alternative was two
 * copies of a 90-line keypress handler that would drift — and the specific way
 * it would drift is that a fix found while reading a live room would not reach
 * the screen people reread closed rooms on, which is the screen a fix is most
 * likely to be *found* on. The live client keeps only what is genuinely about
 * being connected: the poll loop, the owner prompt, the liveness line.
 *
 * The two things that differ are injected rather than branched on: `status`
 * supplies the tail of the footer, and `onOwnerPrompt` is what `o` does — a
 * closed room has nobody to send a command to, so it says so instead.
 */

export interface ViewerOptions {
  renderer: CliRenderer;
  /** Called for `q` and Ctrl-C. */
  quit: () => void;
  /** The right-hand end of the footer. Recomputed on every refresh. */
  status: () => string;
  /** What `o` does. Defaults to a notice explaining why it does nothing. */
  onOwnerPrompt?: () => void;
  /**
   * First refusal on every key. The owner prompt owns the keyboard while it is
   * open — otherwise typing "q" into a veto would quit the client. Returns true
   * when it has consumed the key.
   */
  beforeKey?: (event: ParsedKey) => boolean;
}

export class Viewer {
  readonly chatView: ChatView;
  private filtered: RosterEntry | null = null;
  private matchCursor = -1;
  private participants = 0;
  private search: SearchPromptState = CLOSED;
  private readonly options: ViewerOptions;

  constructor(options: ViewerOptions) {
    this.options = options;
    const { renderer } = options;

    // Selecting a participant filters the stream in place instead of opening a
    // window over it. The modal this replaces could not be scrolled, did not
    // compose with search, cost a keypress to leave, and was pinned at
    // hardcoded coordinates across the roster it had been opened from.
    this.chatView = new ChatView(renderer, {
      width: renderer.terminalWidth,
      height: renderer.terminalHeight,
      onSelectAgent: (agent: RosterEntry) => this.applyFilter(agent),
      // A closed room has nobody to send a command to, so the footer must not
      // print the key for one. The help overlay still lists it and says why.
      hideBindings: options.onOwnerPrompt ? [] : (["owner.prompt"] as const),
    });
    renderer.root.add(this.chatView.node);
  }

  /** How many people the footer should say are here. */
  setParticipants(count: number): void {
    this.participants = count;
  }

  applyFilter(agent: RosterEntry | null): void {
    this.filtered = agent;
    this.chatView.setFilter(agent?.id ?? null);
    this.matchCursor = -1;
    this.chatView.scrollToBottom();
    this.refreshFooter();
  }

  refreshFooter(): void {
    // On a terminal too narrow for the roster, the footer is the only place
    // that still says how many people are in the room.
    const here = this.chatView.isRosterVisible() || this.participants === 0 ? "" : `${this.participants} here · `;
    // A filter or a search that is on but invisible is the worst of both: the
    // pane looks like a quiet room. `less` prints a single `&` for the same
    // reason, and k9s puts the live filter in the view title.
    const filterNote = this.filtered === null ? "" : `filter: ${this.filtered.name} · `;
    const query = this.chatView.transcript.currentQuery();
    const total = this.chatView.transcript.matches().length;
    // `matchCursor` is -1 until a match has been jumped to, and `applyFilter`
    // resets it — so this printed "0/2", a match number that does not exist.
    // Before a position is known, say how many there are.
    const position = this.matchCursor >= 0 ? `${this.matchCursor + 1}/${total}` : `${total} matches`;
    const searchNote = query === "" ? "" : `/${query} ${total === 0 ? "no matches" : position} · `;
    this.chatView.footer.setLiveness(`${filterNote}${searchNote}${here}${this.options.status()}`);
    // Only say something when the reader is *not* where new messages land —
    // a permanent "at bottom" would be another word that always says the same
    // thing, which is the habit this footer exists to break.
    this.chatView.footer.setScrollNote(this.chatView.isAtBottom() ? null : "scrolled up · G to follow");
  }

  handleKey(event: ParsedKey): void {
    // The help overlay swallows the keyboard, so a key pressed at a screen
    // explaining the keys does not also fire the thing it explains.
    if (this.chatView.help.isVisible()) {
      if (event.name === "escape" || event.sequence === "?") this.chatView.help.hide();
      return;
    }

    if (this.options.beforeKey?.(event) === true) return;

    if (this.search.open) {
      const stepped = stepSearchPrompt(this.search, event);
      this.search = stepped.state;
      this.chatView.statusBar.setNotice(searchPromptLine(this.search));
      if (stepped.action.type === "search") {
        this.chatView.setQuery(stepped.action.query);
        this.chatView.statusBar.setNotice(null);
        if (stepped.action.query !== "") this.jumpTo(this.chatView.transcript.nextMatch(-1));
        else this.refreshFooter();
      } else if (stepped.action.type === "cancel") {
        this.chatView.statusBar.setNotice(null);
      }
      return;
    }

    // Any other key clears a leftover result line and falls through.
    this.chatView.statusBar.setNotice(null);

    const action = resolveAction(event);
    if (action === null) return;

    // One row per action rather than a chain of conditions, so the set of
    // things a key can do is a list you can read, and adding one cannot
    // accidentally shadow an earlier branch.
    const chat = this.chatView;
    const half = Math.max(1, Math.floor(chat.pageSize() / 2));
    const handlers: Record<Action, () => void> = {
      "scroll.lineUp": () => chat.scrollByLines(-1),
      "scroll.lineDown": () => chat.scrollByLines(1),
      "scroll.pageUp": () => chat.scrollByLines(-chat.pageSize()),
      "scroll.pageDown": () => chat.scrollByLines(chat.pageSize()),
      "scroll.halfUp": () => chat.scrollByLines(-half),
      "scroll.halfDown": () => chat.scrollByLines(half),
      "scroll.top": () => chat.scrollToTop(),
      "scroll.bottom": () => chat.scrollToBottom(),
      "roster.prev": () => chat.roster.moveSelection(-1),
      "roster.next": () => chat.roster.moveSelection(1),
      "roster.open": () => chat.roster.confirmSelection(),
      "filter.clear": () => this.applyFilter(null),
      "search.open": () => {
        this.search = opened();
        chat.statusBar.setNotice(searchPromptLine(this.search));
      },
      "search.next": () => this.jumpTo(chat.transcript.nextMatch(this.currentEntryIndex())),
      "search.previous": () => this.jumpTo(chat.transcript.previousMatch(this.currentEntryIndex())),
      "owner.prompt": () =>
        this.options.onOwnerPrompt
          ? this.options.onOwnerPrompt()
          : chat.statusBar.setNotice("this room is closed — nothing to send a command to"),
      "transcript.export": () => this.exportTranscript(),
      "help.toggle": () => chat.help.toggle(),
      "app.quit": () => this.options.quit(),
    };
    handlers[action]();
    this.refreshFooter();
  }

  private jumpTo(index: number | null): void {
    if (index === null) {
      this.chatView.statusBar.setNotice(`no match for "${this.chatView.transcript.currentQuery()}"`);
      this.matchCursor = -1;
    } else {
      this.matchCursor = this.chatView.transcript.matches().indexOf(index);
      this.chatView.scrollToEntry(index);
      this.chatView.statusBar.setNotice(null);
    }
    this.refreshFooter();
  }

  /**
   * Where `n` and `N` start counting from: the match cursor if a search is
   * already underway, otherwise the end of the transcript, so the first `n`
   * after a fresh `/` wraps to the earliest match rather than jumping from
   * wherever the last search happened to leave off.
   */
  private currentEntryIndex(): number {
    return this.chatView.transcript.matches()[this.matchCursor] ?? -1;
  }

  /**
   * Writes what is on screen to a file and names the path.
   *
   * Claude Code's transcript viewer dumps into the terminal's own scrollback so
   * tmux copy-mode and the terminal's find can reach it. roomyx cannot leave
   * the alternate screen safely while the room is still streaming into it, so
   * it writes a file instead — same purpose, which is to get the text somewhere
   * the reader's existing tools already work.
   *
   * It never overwrites: `wx` fails if the path exists and the loop takes the
   * next free suffix. Silently replacing an export someone took a minute ago is
   * exactly the kind of small theft a keystroke should not be able to commit.
   */
  private exportTranscript(): void {
    const base = exportBaseName(this.filtered?.id ?? null);
    const target = nextFreeExportPath(process.cwd(), base, existsSync);
    if (!target.ok) {
      this.chatView.statusBar.setNotice(
        target.reason === "exhausted"
          ? `${base}.txt and 99 numbered siblings all exist — nothing written`
          : "refusing to write outside the working directory",
      );
      return;
    }
    try {
      // `wx` creates or fails; it never truncates.
      writeFileSync(target.path, `${this.chatView.transcript.toText()}\n`, { encoding: "utf8", flag: "wx" });
      // The name, not the absolute path: the status bar is one line and
      // truncates, and an absolute path under a deep working directory gets cut
      // exactly where the filename would have been.
      this.chatView.statusBar.setNotice(`written to ./${target.name}`);
    } catch (error) {
      this.chatView.statusBar.setNotice(
        `could not write ./${target.name} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
