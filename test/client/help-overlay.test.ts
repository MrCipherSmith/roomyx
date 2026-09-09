import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { ChatView } from "../../src/client/screens/chat-view";
import { bindingRows, helpBody } from "../../src/client/components/help-overlay";

/**
 * A box does not clip: content past its last row is painted into the bottom
 * border and then over whatever is under the box. The previous version sized
 * itself with `min(rows + 5, height - 2)` and drew its full content anyway, so
 * on any terminal shorter than 20 rows it reproduced the exact defect the
 * comment above that line claimed to have fixed — and below 17 rows the
 * `? or Esc closes` line was gone entirely while the overlay still swallowed
 * every key.
 */

describe("the help body fits the height it is given", () => {
  test("the close hint is never the line that gets dropped", () => {
    // A reader trapped in a mode has to be told how to leave it. That is the
    // one line that survives every squeeze.
    for (let rows = 1; rows <= bindingRows().length + 4; rows += 1) {
      expect(helpBody(rows)).toContain("? or Esc closes");
    }
  });

  test("it never returns more lines than it was given", () => {
    for (let rows = 0; rows <= bindingRows().length + 6; rows += 1) {
      expect(helpBody(rows).length).toBeLessThanOrEqual(Math.max(0, rows));
    }
  });

  test("a truncation says how much it hid", () => {
    const squeezed = helpBody(6);
    expect(squeezed.some((line) => line.includes("more, widen the terminal"))).toBe(true);
  });

  test("given room, every binding is listed", () => {
    const full = helpBody(bindingRows().length + 2);
    for (const row of bindingRows()) expect(full).toContain(row);
  });
});

describe("the rendered overlay", () => {
  test("draws nothing into its own border, at every height", async () => {
    for (let height = 10; height <= 40; height += 1) {
      const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 60, height });
      const view = new ChatView(renderer, { width: 60, height });
      renderer.root.add(view.node);
      view.help.toggle();
      await renderOnce();

      const borders = captureCharFrame()
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("└") || line.startsWith("┌"));
      for (const border of borders) {
        expect(border).toMatch(/^[┌└][─]+[┐┘]$/);
      }
      renderer.destroy();
    }
  }, 60000);

  test("the way out is on screen at every height", async () => {
    for (let height = 10; height <= 40; height += 2) {
      const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 60, height });
      const view = new ChatView(renderer, { width: 60, height });
      renderer.root.add(view.node);
      view.help.toggle();
      await renderOnce();
      expect(captureCharFrame()).toContain("Esc closes");
      renderer.destroy();
    }
  }, 60000);
});
