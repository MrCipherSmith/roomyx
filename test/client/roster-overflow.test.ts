import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { ChatView } from "../../src/client/screens/chat-view";

/**
 * A participant name too long for the 24-column gutter used to render an empty
 * row. The row is `height: 1` with default word wrapping, so an over-long label
 * went to a second line that `height: 1` then clipped — the whole trailing word
 * disappeared rather than being trimmed at the edge.
 *
 * `j`/`k` still moved onto that row and Enter still filtered by it, so the
 * filter was attributed to a participant whose name was nowhere on screen.
 */

async function gutterFor(name: string): Promise<string> {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 100, height: 12 });
  const view = new ChatView(renderer, { width: 100, height: 12 });
  renderer.root.add(view.node);
  view.setRoster([{ id: "x", name }]);
  await renderOnce();
  const gutter = captureCharFrame().split("\n")[1]?.slice(0, 24) ?? "";
  renderer.destroy();
  return gutter;
}

describe("a roster row", () => {
  test("is never blank, at any name length", async () => {
    for (const length of [1, 5, 21, 22, 23, 24, 30, 40, 80]) {
      const gutter = await gutterFor("N".repeat(length));
      // Before the fix, 23 and above rendered nothing but the selection marker.
      expect(gutter.trim().replace(/^>\s*/, "").length).toBeGreaterThan(0);
    }
  }, 60000);

  test("a name that does not fit is marked as cut, not silently shortened", async () => {
    const gutter = await gutterFor("Bartholomiewfeatherstonehaughthethird");
    expect(gutter).toContain("…");
    expect(gutter).toContain("Barthol");
  });

  test("a name that fits is untouched", async () => {
    const gutter = await gutterFor("Ann");
    expect(gutter.trim()).toBe("> Ann");
  });

  test("a multi-word name loses its tail to a marker, not to the wrap", async () => {
    // This one used to render "  Bartholomew" — 22 characters dropped with
    // nothing to show for them, because word wrapping moved the whole second
    // word to a line that was then clipped.
    const gutter = await gutterFor("Bartholomew Featherstonehaugh III");
    expect(gutter).toContain("…");
  });

  test("a full-width name leaves the stream a separating column", async () => {
    const gutter = await gutterFor("N".repeat(60));
    expect(gutter.length).toBe(24);
    expect(gutter[23]).toBe(" ");
  });
});
