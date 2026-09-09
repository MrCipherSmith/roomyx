import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { ChatView } from "../../src/client/screens/chat-view";
import type { MessageEnvelope } from "../../src/log/types";

/**
 * The acceptance criterion the review room asked for by name: not "seq 1 is
 * drawn" but **a test that fails when seq 1 is not drawn**.
 *
 * This shipped to a published 0.4.0 for exactly one reason — `render.test.ts`
 * asserted roster names and the goal statement and never once asserted that a
 * message body appeared. It certified the frame and not the picture.
 *
 * The markers are chosen so no one is a substring of another. An earlier
 * version of this measurement used `MSG-1`, which `MSG-10` satisfies, and it
 * reported the bug as fixed at large message counts when it was not.
 */

function messages(count: number): MessageEnvelope[] {
  // Speakers alternate so that each message keeps its own header — consecutive
  // turns from one speaker deliberately share one, which would otherwise make
  // "one header per message" the wrong thing to count.
  return Array.from({ length: count }, (_, i) => ({
    seq: i + 1,
    from: i % 2 === 0 ? "a" : "b",
    body: i === 0 ? "FIRSTMARKER" : i === count - 1 ? "LASTMARKER" : `filler ${i}`,
  }));
}

async function render(height: number, count: number) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 60, height });
  const view = new ChatView(renderer, { width: 60, height });
  renderer.root.add(view.node);
  view.setRoster([
    { id: "a", name: "Ann" },
    { id: "b", name: "Bob" },
  ]);
  view.appendMessages(messages(count));
  await renderOnce();
  const frame = captureCharFrame();
  // Each renderer registers a console listener; a file that builds a dozen of
  // them without this prints a memory-leak warning per test and buries real output.
  renderer.destroy();
  return {
    first: frame.includes("FIRSTMARKER"),
    last: frame.includes("LASTMARKER"),
    bodies: ["FIRSTMARKER", "LASTMARKER", ...Array.from({ length: count - 2 }, (_, i) => `filler ${i + 1}`)].filter(
      (marker) => frame.includes(marker),
    ).length,
  };
}

describe("the first message of a room", () => {
  test("a room with exactly one message shows that message", async () => {
    // The worst case, and the one a person meets first: seed a room, attach,
    // and see an empty pane. Before the fix this drew nothing at all.
    const { first } = await render(20, 1);
    expect(first).toBe(true);
  });

  // A turn now costs three rows — header, body, separating blank — where it
  // used to cost one, so three of them need a pane of eleven rows before the
  // oldest is legitimately scrolled off the top. That is the price of the
  // hierarchy pass, and it is paid back by consecutive same-speaker turns
  // sharing a header.
  for (const height of [12, 16, 20]) {
    test(`seq 1 survives at height ${height}`, async () => {
      const { first, last } = await render(height, 3);
      expect(first).toBe(true);
      expect(last).toBe(true);
    });
  }

  test("a short room draws every message it has, not one fewer", async () => {
    // The symptom underneath the symptom — the pane always dropped the oldest
    // message, because the horizontal scrollbar took a viewport row.
    for (const count of [1, 2, 3]) {
      const { bodies } = await render(24, count);
      expect(bodies).toBe(count);
    }
  });

  // The barrier heights, found by sweeping rather than guessed.
  //
  // The scrollbar steals one viewport row whether or not it has anything to
  // scroll, so the defect only shows where the content exactly fills the pane —
  // one row of slack anywhere and both versions look identical. Measured: with
  // the fix, 2 messages need height 6, 3 need 9, 4 need 12; without it, each
  // needs one more. Every case below sits on that boundary.
  //
  // This is why the earlier version of this file stopped being a barrier. It
  // was a real one when written, then it was rewritten for the taller
  // typography layout — alternating speakers, three rows a turn — and every
  // remaining case had slack. Nobody re-ran the mutation after the rewrite.
  for (const [count, height] of [
    [2, 6],
    [3, 9],
    [4, 12],
  ] as const) {
    test(`seq 1 survives where ${count} messages exactly fill a pane of height ${height}`, async () => {
      const { first } = await render(height, count);
      expect(first).toBe(true);
    });
  }

  test("a room longer than the viewport still sticks to the bottom", async () => {
    const { first, last } = await render(10, 40);
    expect(last).toBe(true);
    // Sticky-bottom is doing its job, so the top of a long room is off-screen.
    expect(first).toBe(false);
  });
});
