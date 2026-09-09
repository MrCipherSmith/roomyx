import type { MessageEnvelope } from "../log/types";

/**
 * What the transcript pane is showing, as data.
 *
 * The view used to append renderables straight into the scroll box and keep no
 * record of what it had drawn, which made a filter or a search impossible to
 * write: there was nothing to filter or search. Splitting the model out also
 * means the interesting behaviour — which messages are visible, which ones a
 * query matches, where "next match" goes — is testable without a renderer, a
 * terminal or a server.
 *
 * A system line (a connection change) is part of the transcript too, because a
 * reader scrolling back needs to see where the room went quiet. It carries no
 * speaker, so a participant filter hides it: while you are reading one
 * person's turns, the room's plumbing is not what you asked for.
 */
export interface SystemEntry {
  kind: "system";
  text: string;
}

export interface MessageEntry {
  kind: "message";
  message: MessageEnvelope;
  /** Resolved display name, so the model can be searched by what is on screen. */
  fromName: string;
}

export type Entry = MessageEntry | SystemEntry;

export class Transcript {
  private entries: Entry[] = [];
  private filterId: string | null = null;
  private query = "";

  append(entry: Entry): void {
    this.entries.push(entry);
  }

  /** Null clears the filter. */
  setFilter(participantId: string | null): void {
    this.filterId = participantId;
  }

  filter(): string | null {
    return this.filterId;
  }

  /** Empty clears the search. */
  setQuery(query: string): void {
    this.query = query;
  }

  currentQuery(): string {
    return this.query;
  }

  visible(): Entry[] {
    if (this.filterId === null) return this.entries;
    return this.entries.filter((entry) => entry.kind === "message" && entry.message.from === this.filterId);
  }

  /**
   * Indices into `visible()` that contain the query, matched case-insensitively
   * against what a reader can actually see — the speaker's display name, the
   * kind tag and the body — rather than against the raw envelope. Searching for
   * "Ann" should find messages headed `Ann`, not messages from the id `a`.
   */
  matches(): number[] {
    if (this.query === "") return [];
    const needle = this.query.toLowerCase();
    return this.visible()
      .map((entry, index) => {
        const haystack =
          entry.kind === "system"
            ? entry.text
            : `${entry.fromName} ${entry.message.kind ?? ""} ${entry.message.body}`;
        return haystack.toLowerCase().includes(needle) ? index : -1;
      })
      .filter((index) => index >= 0);
  }

  /**
   * The match at or after `from`, wrapping to the first. Returns null when
   * nothing matches, so the caller can say so rather than silently doing
   * nothing — a search that finds nothing and looks identical to a search that
   * found something is the failure this whole pane keeps repeating.
   */
  nextMatch(from: number): number | null {
    const all = this.matches();
    if (all.length === 0) return null;
    return all.find((index) => index > from) ?? all[0] ?? null;
  }

  previousMatch(from: number): number | null {
    const all = this.matches();
    if (all.length === 0) return null;
    const earlier = all.filter((index) => index < from);
    return earlier[earlier.length - 1] ?? all[all.length - 1] ?? null;
  }

  /** True when a message at `index` in `visible()` starts a new speaker's run. */
  startsRun(index: number): boolean {
    const entries = this.visible();
    const entry = entries[index];
    if (entry === undefined || entry.kind !== "message") return false;
    const previous = entries[index - 1];
    return previous === undefined || previous.kind !== "message" || previous.message.from !== entry.message.from;
  }

  /** Plain text of everything currently visible, for writing out of the TUI. */
  toText(): string {
    return this.visible()
      .map((entry) => {
        if (entry.kind === "system") return `— ${entry.text} —`;
        const tag = [entry.message.kind, entry.message.in_reply_to === undefined ? null : `re #${entry.message.in_reply_to}`]
          .filter((part): part is string => Boolean(part))
          .join(" ");
        return `${entry.fromName}${tag ? `  ${tag}` : ""}\n  ${entry.message.body}`;
      })
      .join("\n\n");
  }
}
