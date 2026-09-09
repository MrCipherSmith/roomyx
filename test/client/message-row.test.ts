import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { ChatView } from "../../src/client/screens/chat-view";
import type { MessageEnvelope } from "../../src/log/types";

/**
 * These assert what reaches the screen, not what the component was handed.
 * The pre-existing render test checked roster names and the goal line and
 * never once looked at a message body, which is how a truncating row and two
 * silently-dropped envelope fields shipped.
 */

async function frameFor(messages: MessageEnvelope[], width = 60, height = 24): Promise<string> {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width, height });
  const view = new ChatView(renderer, { width, height });
  renderer.root.add(view.node);
  view.setRoster([{ id: "a", name: "Ann" }]);
  view.appendMessages(messages);
  await renderOnce();
  const frame = captureCharFrame();
  renderer.destroy();
  return frame;
}

describe("a message row", () => {
  test("a body wider than the pane wraps instead of being cut", async () => {
    // The tail is what matters: truncation always takes the end of the
    // sentence, which in an argument is where the claim lives.
    const body = `${"padding word ".repeat(20)}CONCLUSIONMARKER`;
    const frame = await frameFor([{ seq: 1, from: "a", body }]);
    expect(frame).toContain("CONCLUSIONMARKER");
  });

  test("wrapping breaks on words, not mid-word", async () => {
    const frame = await frameFor([{ seq: 1, from: "a", body: "alpha ".repeat(30).trim() }]);
    // "alph" at a line end would mean char wrapping.
    expect(frame).not.toMatch(/alph\s*\n/);
  });

  test("kind and in_reply_to are shown", async () => {
    const frame = await frameFor([
      { seq: 1, from: "a", body: "opening" },
      { seq: 2, from: "a", kind: "challenge", in_reply_to: 1, body: "disputed" },
    ]);
    expect(frame).toContain("[challenge re #1]");
  });

  test("either field alone renders, and neither leaves the row clean", async () => {
    const kindOnly = await frameFor([{ seq: 1, from: "a", kind: "vote", body: "yes" }]);
    expect(kindOnly).toContain("Ann [vote]: yes");

    const replyOnly = await frameFor([{ seq: 2, from: "a", in_reply_to: 7, body: "because" }]);
    expect(replyOnly).toContain("Ann [re #7]: because");

    const plain = await frameFor([{ seq: 3, from: "a", body: "hello" }]);
    expect(plain).toContain("Ann: hello");
    // No empty bracket pair on a message with neither field. Scoped to the row
    // rather than the frame, because the status bar legitimately draws
    // "[connecting…]" — an earlier version of this assertion searched the whole
    // frame and failed on the status bar.
    const row = plain.split("\n").find((line) => line.includes("Ann: hello")) ?? "";
    expect(row).not.toContain("[");
  });
});
