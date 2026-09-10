import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { Viewer } from "../../src/client/viewer";

/**
 * What a closed room must not offer.
 *
 * The owner command is the one action in this client that writes: it posts into
 * a live room's log through the server. A room being reread from a file has no
 * server and no dispatcher, so the key does nothing — and a footer that prints
 * it anyway is the same failure as the permanent `[connected]` chip this footer
 * was rebuilt to remove. A printed word that is not true of what is on screen
 * teaches the reader to stop reading the footer.
 */

const KEY_O = { name: "o", sequence: "o", ctrl: false, meta: false, shift: false };

async function footerOf(readOnly: boolean): Promise<{ footer: string; notice: string }> {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 100, height: 12 });
  const viewer = new Viewer({
    renderer: renderer as never,
    quit: () => undefined,
    status: () => "status",
    ...(readOnly ? {} : { onOwnerPrompt: () => viewer.chatView.statusBar.setNotice("owner prompt opened") }),
  });
  viewer.chatView.appendMessages([{ seq: 1, from: "a", body: "hello" }]);
  viewer.refreshFooter();
  await renderOnce();
  // Located by content, not by row index: the footer is the last *non-blank*
  // row, and a short pane leaves blank rows under it.
  const footer = captureCharFrame()
    .split("\n")
    .filter((line) => line.includes("scroll"))
    .join(" ");

  viewer.handleKey(KEY_O as never);
  await renderOnce();
  const notice = captureCharFrame().split("\n")[0] ?? "";

  renderer.destroy();
  return { footer, notice };
}

describe("a room opened read-only", () => {
  test("does not advertise the owner command in the footer", async () => {
    const { footer } = await footerOf(true);
    expect(footer).not.toContain("command");
    // The rest of the footer is unchanged — this drops one hint, it does not
    // strip the row.
    expect(footer).toContain("scroll");
    expect(footer).toContain("quit");
  });

  test("a live room still does advertise it — the difference is the point", async () => {
    // Without this, deleting the whole exclusion would leave the test above
    // passing on a footer that had simply lost every hint.
    const { footer } = await footerOf(false);
    expect(footer).toContain("command");
  });

  test("pressing the key says why nothing happened, rather than nothing happening", async () => {
    const { notice } = await footerOf(true);
    expect(notice).toContain("closed");
    expect(notice).not.toContain("owner prompt opened");
  });

  test("in a live room the same key opens the prompt", async () => {
    const { notice } = await footerOf(false);
    expect(notice).toContain("owner prompt opened");
  });
});
