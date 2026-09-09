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
  view.setRoster([
    { id: "a", name: "Ann" },
    { id: "b", name: "Bob" },
  ]);
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
      { seq: 2, from: "b", kind: "challenge", in_reply_to: 1, body: "disputed" },
    ]);
    expect(frame).toContain("challenge re #1");
  });

  test("either field alone renders, and neither leaves a stray tag behind", async () => {
    const kindOnly = await frameFor([{ seq: 1, from: "a", kind: "vote", body: "yes" }]);
    expect(kindOnly).toMatch(/Ann\s+vote/);
    expect(kindOnly).toContain("yes");

    const replyOnly = await frameFor([{ seq: 2, from: "a", in_reply_to: 7, body: "because" }]);
    expect(replyOnly).toMatch(/Ann\s+re #7/);

    const plain = await frameFor([{ seq: 3, from: "a", body: "hello" }]);
    const header = plain.split("\n").find((line) => line.includes("Ann")) ?? "";
    expect(header.trim()).toBe("Ann");
    expect(plain).toContain("hello");
  });

  test("the body is indented under its speaker, so a wrap reads as a continuation", async () => {
    // Before this, a wrapped line began at the same column as a new turn, so
    // the two were indistinguishable and sixteen messages were one grey wall.
    const frame = await frameFor([{ seq: 1, from: "a", body: "indented body text" }]);
    const lines = frame.split("\n");
    const headerIndex = lines.findIndex((line) => line.includes("Ann"));
    const bodyLine = lines[headerIndex + 1] ?? "";
    const nameColumn = (lines[headerIndex] ?? "").indexOf("Ann");
    expect(bodyLine.indexOf("indented")).toBeGreaterThan(nameColumn);
  });

  test("consecutive turns from one speaker share a header", async () => {
    // `long.png` repeated the same prefix nine times running, which hides the
    // one thing a header is for: telling you the speaker changed.
    const frame = await frameFor([
      { seq: 1, from: "a", body: "first" },
      { seq: 2, from: "a", body: "second" },
      { seq: 3, from: "a", body: "third" },
      { seq: 4, from: "b", body: "fourth" },
    ]);
    const headers = frame.split("\n").filter((line) => line.trim() === "Ann").length;
    expect(headers).toBe(1);
    expect(frame.split("\n").filter((line) => line.trim() === "Bob").length).toBe(1);
    for (const body of ["first", "second", "third", "fourth"]) expect(frame).toContain(body);
  });
});
