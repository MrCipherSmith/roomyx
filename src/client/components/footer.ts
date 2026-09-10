import { TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import { footerHints } from "../keymap";
import type { Action } from "../keymap";

/**
 * The bottom line: what the room is doing on the left, what your keys are on
 * the right.
 *
 * Two reviewers arrived at this independently and it closes four separate
 * complaints — an empty room that looked hung, a dead room that looked live, a
 * keymap advertised nowhere, and a scroll position with no indicator. It is
 * deliberately one row: the transcript is the product, and a help panel that
 * costs five rows on a 24-row terminal would be paid for by the thing people
 * came to read.
 *
 * The hints come from the keymap rather than from a string written here, so
 * the footer cannot drift from what the keys actually do.
 */
export class Footer {
  readonly node: TextRenderable;
  private liveness = "";
  private scrollNote: string | null = null;
  private readonly width: number;
  /** Bindings that do not apply to this surface — see `footerHints`. */
  private readonly hidden: readonly Action[];

  constructor(ctx: RenderContext, options: { width: number; hideBindings?: readonly Action[] }) {
    this.width = options.width;
    this.hidden = options.hideBindings ?? [];
    this.node = new TextRenderable(ctx, { content: "", height: 1 });
    this.render();
  }

  setLiveness(liveness: string): void {
    this.liveness = liveness;
    this.render();
  }

  /** Set while the reader has scrolled away from the bottom, null at the bottom. */
  setScrollNote(note: string | null): void {
    this.scrollNote = note;
    this.render();
  }

  private render(): void {
    const left = this.scrollNote === null ? this.liveness : `${this.liveness} · ${this.scrollNote}`;
    // The left half wins the space it needs — knowing the room is dead matters
    // more than being reminded which key quits — but the hints give way one at
    // a time rather than all at once. The first version dropped every hint the
    // moment the line did not fit, which took them away in exactly the two
    // states that most need them: an empty room, and a scrolled one.
    const right = footerHints(Math.max(0, this.width - left.length - 2), this.hidden);
    const gap = this.width - left.length - right.length;
    this.node.content = right === "" || gap < 2 ? left.slice(0, Math.max(0, this.width)) : `${left}${" ".repeat(gap)}${right}`;
  }
}
