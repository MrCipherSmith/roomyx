import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { RosterEntry } from "../../log/types";

/**
 * Clips a label to `width` columns, marking the cut.
 *
 * The row is a `TextRenderable` with `height: 1` in a fixed-width box, and the
 * default word wrapping put an over-long label on a second line that `height: 1`
 * then clipped — so the overflow was not trimmed at the column edge, the whole
 * trailing word vanished. A single-token name of 23 characters rendered a
 * completely blank row, while `j`/`k` still moved onto it and Enter still
 * filtered by it: a filter attributed to a participant whose name was nowhere
 * on screen.
 *
 * Counted in code units, which is what the box is laid out in. That is wrong
 * for wide characters and is recorded as such — the display-cell arithmetic is
 * deferred with the resize work that will need the same primitive — but a name
 * cut one column early is a different order of problem from a name that is not
 * drawn at all.
 */
function clip(label: string, width: number): string {
  // Unreachable from `ChatView`, which constructs this with a hardcoded width
  // of 24 — a mutation pass confirmed deleting it changes nothing. Kept as a
  // total function rather than as a guard: `clip` is exported-shaped and a
  // caller with a narrower gutter is exactly what the deferred resize work will
  // introduce. Recorded so it is not read as protection it does not provide.
  if (width <= 0) return "";
  if (label.length <= width) return label;
  return width === 1 ? "…" : `${label.slice(0, width - 1)}…`;
}

/** Same ids, same names, same order — the only thing a rebuild would change. */
function sameRoster(a: RosterEntry[], b: RosterEntry[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry.id === b[i]?.id && entry.name === b[i]?.name);
}

/**
 * Roster list — one Renderable row per participant, not a single joined-text
 * blob (per-row rows are required for OpenTUI mouse targeting and keep the
 * selection highlight isolated to one row's own state).
 */
export class RosterSidebar {
  readonly node: BoxRenderable;
  private roster: RosterEntry[] = [];
  private rows: TextRenderable[] = [];
  private selectedIndex = 0;
  private onSelect: ((agent: RosterEntry) => void) | undefined;
  private readonly width: number;

  constructor(
    private readonly ctx: RenderContext,
    options: { width: number; onSelect?: (agent: RosterEntry) => void },
  ) {
    this.width = options.width;
    this.node = new BoxRenderable(ctx, { width: options.width, flexDirection: "column" });
    this.onSelect = options.onSelect;
  }

  setRoster(roster: RosterEntry[]): void {
    // `onStateUpdate` calls this on every `room.get_state` poll — every three
    // seconds — whether or not anything changed, and a room's roster changes
    // approximately never. Rebuilding it anyway was not merely wasteful: see
    // the destroy below.
    if (sameRoster(this.roster, roster)) return;

    this.roster = roster;
    for (const row of this.rows) {
      this.node.remove(row);
      // `remove()` unlinks; it does not free. The native yoga node and the
      // TextBuffer are released only by `destroy()`, and the native pool is
      // finite — so this was a ceiling, not a slow leak. Measured at five
      // leaked renderables per poll with an unchanged five-person roster: an
      // idle attached client exhausted the pool and died in about 2.7 hours,
      // then reported it as a lost connection.
      row.destroyRecursively();
    }
    this.rows = roster.map((agent, index) => {
      const row = new TextRenderable(this.ctx, {
        content: this.rowLabel(agent, index),
        height: 1,
        // Explicit, rather than relying on `height: 1` to hide a wrap. That
        // reliance is what turned an overflow into a vanished row.
        wrapMode: "none",
      });
      this.node.add(row);
      return row;
    });
    this.highlightSelected();
  }

  moveSelection(delta: 1 | -1): void {
    if (this.roster.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.roster.length) % this.roster.length;
    this.highlightSelected();
  }

  confirmSelection(): void {
    const agent = this.roster[this.selectedIndex];
    if (agent) this.onSelect?.(agent);
  }

  private rowLabel(agent: RosterEntry, index: number): string {
    const marker = index === this.selectedIndex ? "> " : "  ";
    // One column kept clear on the right, so a full-width name cannot abut the
    // message stream with no separating gap.
    return `${marker}${clip(agent.name, this.width - marker.length - 1)}`;
  }

  private highlightSelected(): void {
    this.rows.forEach((row, index) => {
      const agent = this.roster[index];
      if (agent) row.content = this.rowLabel(agent, index);
    });
  }
}
