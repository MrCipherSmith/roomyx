import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { RosterEntry } from "../../log/types";

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

  constructor(
    private readonly ctx: RenderContext,
    options: { width: number; onSelect?: (agent: RosterEntry) => void },
  ) {
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
      const row = new TextRenderable(this.ctx, { content: this.rowLabel(agent, index), height: 1 });
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
    return `${index === this.selectedIndex ? "> " : "  "}${agent.name}`;
  }

  private highlightSelected(): void {
    this.rows.forEach((row, index) => {
      const agent = this.roster[index];
      if (agent) row.content = this.rowLabel(agent, index);
    });
  }
}
