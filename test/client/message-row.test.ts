import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { ChatView } from "../../src/client/screens/chat-view";
import type { MessageEnvelope } from "../../src/log/types";

/**
 * These assert what reaches the screen, not what the component was handed.
 * The pre-existing render test checked roster names and the goal line and
 * never once looked at a message body, which is how a truncating row and two
 * silently-dropped envelope fields shipped.
 *
 * `after` exists for the filter test: the tag a message draws must not depend
 * on which other messages happen to be visible beside it (D-17 item 5).
 */
async function frameWith(
  messages: MessageEnvelope[],
  after?: (view: ChatView) => void,
  width = 60,
  height = 24,
): Promise<string> {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width, height });
  const view = new ChatView(renderer, { width, height });
  renderer.root.add(view.node);
  view.setRoster([
    { id: "a", name: "Ann" },
    { id: "b", name: "Bob" },
  ]);
  view.appendMessages(messages);
  if (after) after(view);
  await renderOnce();
  const frame = captureCharFrame();
  renderer.destroy();
  return frame;
}

async function frameFor(messages: MessageEnvelope[], width = 60, height = 24): Promise<string> {
  return frameWith(messages, undefined, width, height);
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

  test("the kind and the reply target are shown together", async () => {
    const frame = await frameFor([
      { seq: 1, from: "a", body: "opening" },
      { seq: 2, from: "b", kind: "challenge", in_reply_to: 1, body: "disputed" },
    ]);
    expect(frame).toContain("challenge");
    expect(frame).toContain("-> Ann");
  });

  test("either field alone renders, and neither leaves a stray tag behind", async () => {
    const kindOnly = await frameFor([{ seq: 1, from: "a", kind: "vote", body: "yes" }]);
    expect(kindOnly).toMatch(/Ann\s+vote/);
    expect(kindOnly).toContain("yes");

    // A reply to a seq that is not in this log resolves to nothing. Drawing
    // the number instead is what D-17 removes: it names no speaker, and an
    // unresolved pointer must leave NO stray tag behind rather than half of
    // one. `not.toContain("#7")` alone cannot fail while the formatter has no
    // `#` in it, so the claim is made positively, on the header itself.
    const replyOnly = await frameFor([{ seq: 2, from: "a", in_reply_to: 7, body: "because" }]);
    const replyHeader = replyOnly.split("\n").find((line) => line.includes("Ann")) ?? "";
    expect(replyHeader.trim()).toBe("Ann");
    expect(replyOnly).not.toContain("#7");

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

describe("the reply pointer", () => {
  test("it names the author of the message being answered, not the sequence number", async () => {
    const frame = await frameFor([
      { seq: 1, from: "a", body: "opening" },
      { seq: 2, from: "b", kind: "challenge", in_reply_to: 1, body: "disputed" },
    ]);
    expect(frame).toContain("-> Ann");
    // The whole point: a number names nobody without counting upwards.
    expect(frame).not.toContain("#1");
  });

  test("it quotes the parent briefly and on one line", async () => {
    const parent = "a very long opening statement about databases and their tradeoffs worth weighing";
    const frame = await frameFor([
      { seq: 1, from: "a", body: parent },
      { seq: 2, from: "b", kind: "answer", in_reply_to: 1, body: "agreed" },
    ]);
    const tagLine = frame.split("\n").find((line) => line.includes("-> Ann")) ?? "";
    // Cut with ASCII, not `…`: an ambiguous-width glyph shifts the wrap.
    expect(tagLine).toContain("...");
    expect(tagLine).not.toContain("\u2026");
    // And the quote is clipped to the budget, not the parent pasted whole.
    // (The parent itself is also drawn, as the message it is — so this checks
    // the quoted span, not the frame.)
    const quoted = tagLine.slice(tagLine.indexOf('"') + 1, tagLine.lastIndexOf('"'));
    expect(quoted.endsWith("...")).toBe(true);
    expect(quoted.length).toBeLessThanOrEqual(24);
  });

  test("the tag survives a collapsed header, and the header stays collapsed", async () => {
    const frame = await frameFor([
      { seq: 1, from: "a", kind: "pitch", body: "first" },
      { seq: 2, from: "a", kind: "challenge", in_reply_to: 1, body: "second" },
    ]);
    // One header for the run — the speaker's name is not repeated...
    const lines = frame.split("\n");
    expect(lines.filter((line) => line.trim().startsWith("Ann")).length).toBe(1);
    // ...but the second turn's kind and pointer are still on screen, on their
    // own line. They used to be drawn inside the header, so collapsing it
    // erased them.
    const tagLine = lines.find((line) => line.includes("challenge")) ?? "";
    expect(tagLine).toContain("-> Ann");
    expect(tagLine.trim().startsWith("Ann")).toBe(false);
    expect(frame).toContain("second");
  });

  test("a message's tag is the same filtered and unfiltered", async () => {
    // Ann, Bob, Ann: unfiltered, Ann's second turn follows Bob and gets a
    // header. Filtered to Ann, it follows her own turn — and before D-17 the
    // collapsed header took the tag with it, so filtering *hid* the kind.
    const messages: MessageEnvelope[] = [
      { seq: 1, from: "a", kind: "pitch", body: "opening" },
      { seq: 2, from: "b", kind: "challenge", body: "disputed" },
      { seq: 3, from: "a", kind: "vote", in_reply_to: 1, body: "still mine" },
    ];
    const unfiltered = await frameFor(messages);
    const filtered = await frameWith(messages, (view) => view.setFilter("a"));
    for (const frame of [unfiltered, filtered]) {
      expect(frame).toContain("vote");
      expect(frame).toContain("-> Ann");
    }
  });

  test("search finds a row by the text its pointer shows", async () => {
    // The tag is on screen, so `/` must find it — the rule the haystack in
    // matches() states and did not keep.
    const messages: MessageEnvelope[] = [
      { seq: 1, from: "a", body: "opening the argument" },
      { seq: 2, from: "b", kind: "challenge", in_reply_to: 1, body: "disputed" },
    ];
    let matches: number[] = [];
    await frameWith(messages, (view) => {
      view.transcript.setQuery("-> Ann");
      matches = view.transcript.matches();
    });
    expect(matches).toEqual([1]);
  });

  test("the export writes the pointer the pane shows", async () => {
    const messages: MessageEnvelope[] = [
      { seq: 1, from: "a", body: "opening" },
      { seq: 2, from: "b", kind: "challenge", in_reply_to: 1, body: "disputed" },
    ];
    const frame = await frameFor(messages);
    let exported = "";
    await frameWith(messages, (view) => {
      exported = view.transcript.toText();
    });
    expect(exported).toContain("challenge -> Ann");
    expect(frame).toContain("challenge");
    expect(frame).toContain("-> Ann");
  });
});
