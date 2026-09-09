import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { ChatView } from "../../src/client/screens/chat-view";
import type { MessageEnvelope } from "../../src/log/types";

/**
 * The acceptance criterion the review room named: a room taller than the pane
 * must be readable back. Before this, no key scrolled the transcript at all —
 * the arrows moved the roster selection, so pressing Up four times on a
 * sixteen-turn room moved one caret and left the stream frozen.
 */

async function view(count: number, height = 20) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 80, height });
  const chat = new ChatView(renderer, { width: 80, height });
  renderer.root.add(chat.node);
  chat.setRoster([{ id: "a", name: "Ann" }]);
  const messages: MessageEnvelope[] = Array.from({ length: count }, (_, i) => ({
    seq: i + 1,
    from: "a",
    body: i === 0 ? "TOPMARKER" : i === count - 1 ? "BOTTOMMARKER" : `filler ${i}`,
  }));
  chat.appendMessages(messages);
  await renderOnce();
  return { chat, renderOnce, frame: () => captureCharFrame(), destroy: () => renderer.destroy() };
}

describe("scrolling the transcript", () => {
  test("a room taller than the pane starts at the bottom and can be read back to the top", async () => {
    const v = await view(60);
    expect(v.frame()).toContain("BOTTOMMARKER");
    expect(v.frame()).not.toContain("TOPMARKER");

    v.chat.scrollToTop();
    await v.renderOnce();
    expect(v.frame()).toContain("TOPMARKER");

    v.chat.scrollToBottom();
    await v.renderOnce();
    expect(v.frame()).toContain("BOTTOMMARKER");
    v.destroy();
  });

  test("line and page movement actually move, and page moves further than a line", async () => {
    const v = await view(60);
    v.chat.scrollToTop();
    await v.renderOnce();

    v.chat.scrollByLines(1);
    await v.renderOnce();
    const afterOneLine = v.frame();

    v.chat.scrollToTop();
    v.chat.scrollByLines(v.chat.pageSize());
    await v.renderOnce();
    expect(v.frame()).not.toBe(afterOneLine);
    v.destroy();
  });

  test("isAtBottom tells the footer the truth in both directions", async () => {
    const v = await view(60);
    expect(v.chat.isAtBottom()).toBe(true);

    v.chat.scrollByLines(-10);
    await v.renderOnce();
    expect(v.chat.isAtBottom()).toBe(false);

    v.chat.scrollToBottom();
    await v.renderOnce();
    expect(v.chat.isAtBottom()).toBe(true);
    v.destroy();
  });

  test("scrolling cannot run off either end", async () => {
    const v = await view(60);
    v.chat.scrollByLines(-10_000);
    await v.renderOnce();
    expect(v.frame()).toContain("TOPMARKER");

    v.chat.scrollByLines(10_000);
    await v.renderOnce();
    expect(v.frame()).toContain("BOTTOMMARKER");
    v.destroy();
  });

  test("a room that fits in the pane is always at the bottom, and scrolling is a no-op", async () => {
    const v = await view(3);
    expect(v.chat.isAtBottom()).toBe(true);
    v.chat.scrollByLines(-5);
    await v.renderOnce();
    expect(v.frame()).toContain("TOPMARKER");
    expect(v.chat.isAtBottom()).toBe(true);
    v.destroy();
  });

  test("a connection change is written into the transcript, not only into the footer", async () => {
    // A footer repainted at a fixed row with the cursor elsewhere is never
    // spoken by a screen reader and never survives a `tee`. This line is.
    const v = await view(3);
    v.chat.appendSystemLine("disconnected, retrying");
    await v.renderOnce();
    expect(v.frame()).toContain("— disconnected, retrying —");
    v.destroy();
  });
});
