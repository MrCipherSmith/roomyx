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
  return Array.from({ length: count }, (_, i) => ({
    seq: i + 1,
    from: "a",
    body: i === 0 ? "FIRSTMARKER" : i === count - 1 ? "LASTMARKER" : `filler ${i}`,
  }));
}

async function render(height: number, count: number) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 60, height });
  const view = new ChatView(renderer, { width: 60, height });
  renderer.root.add(view.node);
  view.setRoster([{ id: "a", name: "Ann" }]);
  view.appendMessages(messages(count));
  await renderOnce();
  const frame = captureCharFrame();
  // Each renderer registers a console listener; a file that builds a dozen of
  // them without this prints a memory-leak warning per test and buries real output.
  renderer.destroy();
  return {
    first: frame.includes("FIRSTMARKER"),
    last: frame.includes("LASTMARKER"),
    rows: frame.split("\n").filter((line) => line.includes("Ann:")).length,
  };
}

describe("the first message of a room", () => {
  test("a room with exactly one message shows that message", async () => {
    // The worst case, and the one a person meets first: seed a room, attach,
    // and see an empty pane. Before the fix this drew zero rows.
    const { first, rows } = await render(20, 1);
    expect(first).toBe(true);
    expect(rows).toBe(1);
  });

  for (const height of [6, 10, 20]) {
    test(`seq 1 survives at height ${height}`, async () => {
      const { first, last } = await render(height, 3);
      expect(first).toBe(true);
      expect(last).toBe(true);
    });
  }

  test("no viewport row is lost: a short room draws one line per message", async () => {
    // The symptom underneath the symptom — the pane always drew one row fewer
    // than it had messages, because the horizontal scrollbar took a row.
    for (const count of [1, 2, 3, 5]) {
      const { rows } = await render(20, count);
      expect(rows).toBe(count);
    }
  });

  test("a room longer than the viewport still sticks to the bottom", async () => {
    const { first, last } = await render(10, 40);
    expect(last).toBe(true);
    // Sticky-bottom is doing its job, so the top of a long room is off-screen.
    expect(first).toBe(false);
  });
});
