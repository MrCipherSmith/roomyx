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

describe("the roster at narrow widths", () => {
  test("it keeps its gutter on a normal terminal and gives it up on a narrow one", async () => {
    // At 72 columns the roster was spending a third of the terminal on a few
    // short names while messages wrapped to 46. A breakpoint rather than a
    // hard minimum: widen the terminal and the list comes back.
    for (const [width, visible] of [
      [120, true],
      [80, true],
      [79, false],
      [60, false],
    ] as const) {
      const { renderer } = await createTestRenderer({ width, height: 20 });
      const chat = new ChatView(renderer, { width, height: 20 });
      expect(chat.isRosterVisible()).toBe(visible);
      renderer.destroy();
    }
  });

  test("a narrow pane spends the reclaimed columns on the message body", async () => {
    async function widestBodyLine(width: number): Promise<number> {
      const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width, height: 20 });
      const chat = new ChatView(renderer, { width, height: 20 });
      renderer.root.add(chat.node);
      chat.setRoster([{ id: "a", name: "Ann" }]);
      chat.appendMessages([{ seq: 1, from: "a", body: "wrap ".repeat(60).trim() }]);
      await renderOnce();
      const widest = Math.max(
        ...captureCharFrame()
          .split("\n")
          .filter((line) => line.includes("wrap"))
          .map((line) => line.trimEnd().length),
      );
      renderer.destroy();
      return widest;
    }
    // Same terminal width either side of the breakpoint; below it the body gets
    // the roster's 24 columns back.
    expect(await widestBodyLine(79)).toBeGreaterThan(await widestBodyLine(80) - 24 + 20);
  });
});

describe("jumping to a search match", () => {
  test("scrollToEntry brings an off-screen entry into view", async () => {
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 80, height: 20 });
    const chat = new ChatView(renderer, { width: 80, height: 20 });
    renderer.root.add(chat.node);
    chat.setRoster([{ id: "a", name: "Ann" }]);
    chat.appendMessages(
      Array.from({ length: 40 }, (_, i) => ({
        seq: i + 1,
        from: i % 2 === 0 ? "a" : "b",
        body: i === 3 ? "NEEDLEMARKER buried near the top" : `filler ${i}`,
      })),
    );
    await renderOnce();
    // Sticky-bottom means it starts far below the marker.
    expect(captureCharFrame()).not.toContain("NEEDLEMARKER");

    chat.setQuery("NEEDLEMARKER");
    const match = chat.transcript.nextMatch(-1);
    expect(match).toBe(3);
    chat.scrollToEntry(match!);
    await renderOnce();
    expect(captureCharFrame()).toContain("NEEDLEMARKER");
    renderer.destroy();
  });

  test("filtering rebuilds the pane and drops everyone else's turns", async () => {
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 80, height: 24 });
    const chat = new ChatView(renderer, { width: 80, height: 24 });
    renderer.root.add(chat.node);
    chat.setRoster([
      { id: "a", name: "Ann" },
      { id: "b", name: "Bob" },
    ]);
    chat.appendMessages([
      { seq: 1, from: "a", body: "ANNSAID" },
      { seq: 2, from: "b", body: "BOBSAID" },
    ]);
    await renderOnce();
    expect(captureCharFrame()).toContain("BOBSAID");

    chat.setFilter("a");
    await renderOnce();
    const filtered = captureCharFrame();
    expect(filtered).toContain("ANNSAID");
    expect(filtered).not.toContain("BOBSAID");

    chat.setFilter(null);
    await renderOnce();
    expect(captureCharFrame()).toContain("BOBSAID");
    renderer.destroy();
  });

  test("messages arriving while a filter is on do not leak past it", async () => {
    // The incremental-append path has to respect the filter too, otherwise a
    // filtered pane slowly refills with everyone else as new messages land.
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 80, height: 24 });
    const chat = new ChatView(renderer, { width: 80, height: 24 });
    renderer.root.add(chat.node);
    chat.setRoster([
      { id: "a", name: "Ann" },
      { id: "b", name: "Bob" },
    ]);
    chat.appendMessages([{ seq: 1, from: "a", body: "ANNFIRST" }]);
    chat.setFilter("a");
    chat.appendMessages([
      { seq: 2, from: "b", body: "BOBLATER" },
      { seq: 3, from: "a", body: "ANNLATER" },
    ]);
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("ANNFIRST");
    expect(frame).toContain("ANNLATER");
    expect(frame).not.toContain("BOBLATER");

    // And they are still there when the filter comes off.
    chat.setFilter(null);
    await renderOnce();
    expect(captureCharFrame()).toContain("BOBLATER");
    renderer.destroy();
  });
});
