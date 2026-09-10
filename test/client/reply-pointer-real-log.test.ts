import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestRenderer } from "@opentui/core/testing";
import { ChatView } from "../../src/client/screens/chat-view";
import type { MessageEnvelope, RosterEntry } from "../../src/log/types";

/**
 * The verification step of flow 002, run against a real room log rather than a
 * fixture: `screenshots/review-room.jsonl` is the transcript of the 2026-09-09
 * TUI review — four participants, nine messages, four of them replies, two of
 * those answering the *same* earlier message.
 *
 * A fixture would have been written by the same person who wrote the fix. This
 * log was not: it is the record of a conversation that happened, and it is the
 * one that showed the defect (`answer  re #4` twice, naming nobody).
 */
const LOG = join(import.meta.dir, "..", "..", "docs", "roomyx", "screenshots", "review-room.jsonl");

function realRoom(): { roster: RosterEntry[]; messages: MessageEnvelope[] } {
  const lines = readFileSync(LOG, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const state = JSON.parse(lines[0] as string) as { roster: RosterEntry[] };
  const messages = lines.slice(1).map((line) => {
    const { type: _type, ...envelope } = JSON.parse(line) as MessageEnvelope & { type: string };
    return envelope;
  });
  return { roster: state.roster, messages };
}

describe("the reply pointer on a real room log", () => {
  test("no rendered row names a reply by its sequence number", async () => {
    const { roster, messages } = realRoom();
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 120, height: 60 });
    const view = new ChatView(renderer, { width: 120, height: 60 });
    renderer.root.add(view.node);
    view.setRoster(roster);
    view.appendMessages(messages);
    await renderOnce();
    const frame = captureCharFrame();
    renderer.destroy();

    expect(messages.filter((m) => m.in_reply_to !== undefined).length).toBe(4);
    expect(frame).not.toContain("re #");

    // Every reply names the author of the message it answers. Four of nine
    // messages reply, and two of them answer seq 4 — the case where a number
    // gave the reader two identical, unresolvable tags.
    const bySeq = new Map(messages.map((m) => [m.seq, m]));
    const nameById = new Map(roster.map((entry) => [entry.id, entry.name]));
    const expected = messages
      .filter((m) => m.in_reply_to !== undefined)
      .map((m) => `-> ${nameById.get(bySeq.get(m.in_reply_to as number)!.from) as string}`);
    expect(expected).toEqual(["-> Paul", "-> Paul", "-> Inés", "-> Ken"]);
    for (const pointer of expected) expect(frame).toContain(pointer);
  });

  test("search finds each reply by the pointer the pane shows", async () => {
    const { roster, messages } = realRoom();
    const { renderer, renderOnce } = await createTestRenderer({ width: 120, height: 60 });
    const view = new ChatView(renderer, { width: 120, height: 60 });
    renderer.root.add(view.node);
    view.setRoster(roster);
    view.appendMessages(messages);

    view.transcript.setQuery("-> Paul");
    const matches = view.transcript.matches();
    expect(matches).toHaveLength(2);

    // And what the export writes is what the pane drew, for the whole room.
    const exported = view.transcript.toText();
    for (const pointer of ["-> Paul", "-> Inés", "-> Ken"]) expect(exported).toContain(pointer);
    expect(exported).not.toContain("re #");
    renderer.destroy();
    await renderOnce();
  });
});
