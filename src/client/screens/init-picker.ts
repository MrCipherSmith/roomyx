import { BoxRenderable, ScrollBoxRenderable, TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { PlanItem } from "../../installer/init-plan";
import { clip } from "../clip";

/**
 * The checkbox list `roomyx init` shows: what it is about to do, grouped, with
 * the exact path of every write, and nothing happening until Enter.
 *
 * The screen exists because the flag it replaces asked the operator to decide
 * something they could not see. `roomyx skills sync --target claude --yes` is a
 * commitment to a path typed from memory; this is the same commitment made
 * against the path printed in front of them. D-02 wanted a deliberate act — a
 * ticked box you had to look at is more deliberate than a flag, not less.
 *
 * Rows are a flat list of headers and items so that navigation, which must skip
 * headers, is index arithmetic over one array rather than a nested walk.
 */

export type Row = { kind: "header"; text: string } | { kind: "item"; item: PlanItem } | { kind: "submit" };

export function rowsFor(items: readonly PlanItem[]): Row[] {
  const rows: Row[] = [];
  let group: string | null = null;
  for (const item of items) {
    if (item.group !== group) {
      // A blank row before every group but the first. Three headers stacked
      // against their lists with no gap read as one long list with captions in
      // it; the gap is what makes them read as sections.
      if (group !== null) rows.push({ kind: "header", text: "" });
      group = item.group;
      rows.push({ kind: "header", text: group });
    }
    rows.push({ kind: "item", item });
  }
  rows.push({ kind: "submit" });
  return rows;
}

/** Indexes into `rows` that the cursor may land on. */
export function selectableIndexes(rows: readonly Row[]): number[] {
  return rows.map((row, i) => (row.kind === "header" ? -1 : i)).filter((i) => i >= 0);
}

const LABEL_WIDTH = 26;
const LABEL_WIDTH_NARROW = 14;

/**
 * Terminal width at or above which the label column gets its full 26 columns.
 *
 * Below it the column is cut to 14, because the padding was pushing the
 * already-there warning off the end of a 40-column pane — the row that is about
 * to overwrite a file read exactly like a row installing a fresh one. Same
 * failure and same fix as the archive list's timestamp column; a fixed-width
 * field ahead of a variable one is where this keeps happening.
 */
const LABEL_BREAKPOINT = 80;

/**
 * One row's text. Pure and exported for the same reason the archive list's is:
 * every rendering defect this client has shipped in a list row was
 * width-dependent, and a test that renders one width finds none of them.
 */
export function renderRow(row: Row, width: number, focused: boolean): string {
  const cursor = focused ? ">" : " ";
  if (row.kind === "header") return clip(row.text, Math.max(0, width - 1));
  if (row.kind === "submit") {
    return clip(`${cursor} [ Install ]  ↵`, Math.max(0, width - 1));
  }

  const { item } = row;
  const box = item.selected ? "[x]" : "[ ]";
  const labelWidth = width >= LABEL_BREAKPOINT ? LABEL_WIDTH : LABEL_WIDTH_NARROW;
  const label = item.label.length > labelWidth ? clip(item.label, labelWidth) : item.label.padEnd(labelWidth);
  // The note goes before the path, because the path is the long field and is
  // the one truncation eats first — a row whose "already there" warning was cut
  // reads as a fresh install. Same lesson as the archive list's missing-log
  // sigil, which had to move to the front for exactly this reason.
  const note = item.done === undefined ? "" : `${item.done}  `;
  // One space after the label field unconditionally: a label that fills the
  // column exactly used to abut the path with no gap, so `Ignore registry,
  // lockfiles/home/you/.gitignore` read as one token.
  return clip(`${cursor} ${box} ${label} ${note}${item.detail}`, Math.max(0, width - 1));
}

export class InitPicker {
  readonly node: BoxRenderable;
  private readonly rows: Row[];
  private readonly selectable: number[];
  private readonly rendered: TextRenderable[];
  private readonly scroll: ScrollBoxRenderable;
  private cursor = 0;

  constructor(
    ctx: RenderContext,
    private readonly items: PlanItem[],
    private readonly options: { width: number; height: number },
  ) {
    this.rows = rowsFor(items);
    this.selectable = selectableIndexes(this.rows);
    this.node = new BoxRenderable(ctx, {
      width: options.width,
      height: options.height,
      flexDirection: "column",
      border: true,
      title: " roomyx init — pick what to set up ",
    });

    // Scrolled, not laid out flat. The plan is nine skill rows today and grows
    // by a row per runtime; a flat list overflowed a 22-row terminal by one and
    // drew the hint line straight through the bottom border — the same defect
    // the help overlay shipped, from the same cause.
    this.scroll = new ScrollBoxRenderable(ctx, {
      flexGrow: 1,
      // Nothing here scrolls sideways: rows are clipped to the pane width.
      horizontalScrollbarOptions: { visible: false },
    });
    this.node.add(this.scroll);

    // The submit row is pinned below the scroll box, not carried inside it.
    // Inside, a plan taller than the terminal pushed `[ Install ]` off the
    // bottom — the one row that has to be visible for the screen to explain
    // itself was the first one to disappear.
    this.rendered = this.rows.map((row, index) => {
      const text = new TextRenderable(ctx, {
        content: renderRow(row, options.width - 2, index === this.focusedRowIndex()),
        height: 1,
        // Explicit, rather than relying on `height: 1` to hide a wrap — that
        // reliance is what turned an overflow into a vanished row in the
        // roster. See ../clip.
        wrapMode: "none",
      });
      if (row.kind === "submit") this.node.add(text);
      else this.scroll.add(text);
      return text;
    });

    this.node.add(
      new TextRenderable(ctx, {
        content:
          '  ↑/↓ or j/k move · Space toggles · Enter installs · q cancels\n  "replaces" — file exists; diffed and backed up first',
        height: 2,
        wrapMode: "none",
      }),
    );
  }

  /** Keeps the focused row inside the viewport as the cursor moves. */
  private reveal(): void {
    const index = this.focusedRowIndex();
    // The submit row is pinned outside the scroll box, so there is nothing to
    // scroll to when the cursor is on it.
    if (this.rows[index]?.kind === "submit") return;
    const row = this.rendered[index];
    if (row === undefined) return;
    const offset = row.y - this.scroll.content.y;
    const viewport = Math.max(1, this.scroll.viewport.height);
    if (offset < this.scroll.scrollTop) this.scroll.scrollTop = offset;
    else if (offset >= this.scroll.scrollTop + viewport) this.scroll.scrollTop = offset - viewport + 1;
  }

  private focusedRowIndex(): number {
    return this.selectable[this.cursor] ?? -1;
  }

  move(delta: 1 | -1): void {
    if (this.selectable.length === 0) return;
    this.cursor = (this.cursor + delta + this.selectable.length) % this.selectable.length;
    this.repaint();
    this.reveal();
  }

  /** Toggles the focused item. No-op on the submit row, which is not a choice. */
  toggle(): void {
    const row = this.rows[this.focusedRowIndex()];
    if (row?.kind !== "item") return;
    row.item.selected = !row.item.selected;
    this.repaint();
  }

  /** Every item, with the operator's ticks applied. */
  result(): PlanItem[] {
    return this.items;
  }

  /** `remove()` unlinks without freeing, and the native renderable pool is finite. */
  destroy(): void {
    this.node.destroyRecursively();
  }

  private repaint(): void {
    const focused = this.focusedRowIndex();
    this.rendered.forEach((text, index) => {
      const row = this.rows[index];
      if (row) text.content = renderRow(row, this.options.width - 2, index === focused);
    });
  }
}
