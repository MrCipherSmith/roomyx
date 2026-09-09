import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { RosterEntry } from "../../log/types";

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
    this.roster = roster;
    for (const row of this.rows) this.node.remove(row);
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
