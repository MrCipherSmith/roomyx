/**
 * Clips a label to `width` columns, marking the cut.
 *
 * Written because a row is a `TextRenderable` with `height: 1` in a fixed-width
 * box, and the default word wrapping put an over-long label on a second line
 * that `height: 1` then clipped — so the overflow was not trimmed at the column
 * edge, the whole trailing word vanished. A single-token name of 23 characters
 * rendered a completely blank row in the roster, while `j`/`k` still moved onto
 * it and Enter still filtered by it: a filter attributed to a participant whose
 * name was nowhere on screen.
 *
 * Counted in code units, which is what the box is laid out in. That is wrong
 * for wide characters and is recorded as such — the display-cell arithmetic is
 * deferred with the resize work that will need the same primitive — but a name
 * cut one column early is a different order of problem from a name that is not
 * drawn at all.
 *
 * Shared rather than copied: the archive list is the second fixed-width list of
 * single-line rows in this client, and the bug above is a property of that
 * shape, not of the roster.
 */
export function clip(label: string, width: number): string {
  if (width <= 0) return "";
  if (label.length <= width) return label;
  return width === 1 ? "…" : `${label.slice(0, width - 1)}…`;
}
