import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { RoomHistoryRow } from "../../installer/history";
import { clip } from "../clip";

/**
 * The picker for closed rooms: one row per room, newest first, Enter opens the
 * selected one read-only.
 *
 * It lists an *index*, not a folder of archived copies — the log each row points
 * at is the original, wherever the operator put it. That is why a row can say
 * the log is gone: this screen knows a room existed and where its transcript was
 * without owning the transcript. Saying so is the whole reason the distinction
 * is worth having; a shadow copy would have shown text that no longer matches
 * the file the operator thinks they are reading.
 */

const WHEN_WIDTH = 16;
const DATE_WIDTH = 10;

/**
 * Terminal width at or above which a row has room for the time of day as well
 * as the date. Below it those six columns are worth more to the goal statement,
 * which at 60 columns was down to about eighteen characters — the same
 * reasoning, and the same kind of breakpoint, as the roster's.
 */
const TIME_OF_DAY_BREAKPOINT = 80;

/** `2026-09-09 18:04`, or just `2026-09-09` on a narrow pane. */
function when(iso: string, width: number): string {
  const target = width >= TIME_OF_DAY_BREAKPOINT ? WHEN_WIDTH : DATE_WIDTH;
  return iso.slice(0, target).replace("T", " ").padEnd(target);
}

const COUNTS_WIDTH = 20;

/**
 * Exactly `width` columns, whichever way the content misses.
 *
 * `padEnd` alone only fixes the short case, and the long case is the one that
 * happens: `99999 msg  3 here` is 17 columns against a 16-column pad, so a room
 * with five-digit traffic pushed the goal column right and every row below it
 * stopped lining up. Found by sweeping counts rather than by reading — the
 * fixture had two digits.
 */
function fixed(text: string, width: number): string {
  return text.length > width ? clip(text, width) : text.padEnd(width);
}

/**
 * One row's text. Exported and pure so the column arithmetic can be tested at a
 * dozen widths without a renderer — the defects this client shipped in list rows
 * were all width-dependent and all invisible to a test that renders one width.
 */
export function archiveRow(room: RoomHistoryRow, width: number, selected: boolean): string {
  const marker = selected ? "> " : "  ";
  const counts = fixed(`${room.messages} msg  ${room.participants} here`, COUNTS_WIDTH);
  // A two-column sigil at the very front, not a phrase further along the row.
  //
  // This is the one fact that decides whether Enter will do anything, and both
  // wordier placements lose it exactly when it matters: trailing the row, a
  // 60-column pane ate it; moved ahead of the goal, a 40-column pane ate it
  // too, because the date and counts ahead of it already spend 34 columns. Put
  // at the front it cannot be truncated by anything that leaves the row visible
  // at all. The list's hint line carries the legend, and only when some row
  // actually needs it.
  const gone = room.logExists ? "  " : "! ";
  const goal = room.goal === "" ? "(goal unavailable)" : room.goal;
  // Clipped as a whole line, not by giving the goal the leftover budget after a
  // fixed-width head. The head alone is 36 columns, so budgeting that way went
  // negative below a 37-column pane and returned a row wider than the box that
  // holds it — which is how the roster came to draw a name into the message
  // stream. One column kept clear on the right so a full-width goal cannot abut
  // the frame with no separating gap.
  return clip(`${marker}${gone}${when(room.closedAt, width)}  ${counts}${goal}`, Math.max(0, width - 1));
}

export class ArchiveList {
  readonly node: BoxRenderable;
  private readonly rows: TextRenderable[];
  private selectedIndex = 0;

  constructor(
    ctx: RenderContext,
    private readonly rooms: RoomHistoryRow[],
    private readonly options: { width: number; height: number; unreadable: number },
  ) {
    this.node = new BoxRenderable(ctx, {
      width: options.width,
      height: options.height,
      flexDirection: "column",
      border: true,
      title: ` closed rooms (${rooms.length}) `,
    });

    if (rooms.length === 0) {
      this.rows = [];
      this.node.add(
        new TextRenderable(ctx, {
          content:
            "  No closed rooms recorded yet.\n\n" +
            "  A room is recorded here when `roomyx serve` shuts down, and\n" +
            "  when a crashed room is noticed missing by `roomyx rooms list`.",
          wrapMode: "word",
        }),
      );
    } else {
      this.rows = rooms.map((room, index) => {
        const row = new TextRenderable(ctx, {
          content: archiveRow(room, options.width - 2, index === this.selectedIndex),
          height: 1,
          // Explicit rather than relying on `height: 1` to hide a wrap. That
          // reliance is what turned an overflow into a vanished row in the
          // roster; see ../clip.
          wrapMode: "none",
        });
        this.node.add(row);
        return row;
      });
    }

    const hints = ["", "  ↑/↓ or j/k move · Enter opens read-only · q quits"];
    // Only when a row actually carries it. A legend for a symbol nothing on
    // screen is using is a line of noise on every other visit.
    if (rooms.some((room) => !room.logExists)) {
      hints.push("  !  the log is no longer at the path the room recorded");
    }
    if (options.unreadable > 0) {
      hints.push(`  ${options.unreadable} history line(s) unreadable and skipped`);
    }
    this.node.add(new TextRenderable(ctx, { content: hints.join("\n"), wrapMode: "word" }));
  }

  moveSelection(delta: 1 | -1): void {
    if (this.rooms.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.rooms.length) % this.rooms.length;
    this.rows.forEach((row, index) => {
      const room = this.rooms[index];
      if (room) row.content = archiveRow(room, this.options.width - 2, index === this.selectedIndex);
    });
  }

  /** The highlighted room, or null when there are none. */
  selected(): RoomHistoryRow | null {
    return this.rooms[this.selectedIndex] ?? null;
  }

  /** `remove()` unlinks without freeing, and the native renderable pool is finite. */
  destroy(): void {
    this.node.destroyRecursively();
  }
}
