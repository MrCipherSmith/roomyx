#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { createTestRenderer } from "@opentui/core/testing";
import { loadRoomLog } from "../src/log/store";
import { ChatView } from "../src/client/screens/chat-view";

/**
 * Replays a real room log through the real TUI, at whatever volume the log has,
 * and checks what actually reached the screen.
 *
 * The rendering defects this project shipped were all *content*-dependent and
 * every one survived a suite whose fixtures are three short ASCII messages: the
 * first message of a room never drawn, every message clipped at the pane width,
 * a participant name of 23 characters rendering a blank row, a word at the wrap
 * column losing its last character. Fixtures that small cannot express any of
 * them.
 *
 * A real transcript can. It has long turns, non-Latin names, punctuation that
 * wraps badly, and enough messages to scroll — and this project generates them
 * as a matter of course, so there is a corpus lying around already.
 *
 * What it asserts, at every width it is given:
 *
 * - **Every message body reaches the screen.** Scroll to each message in turn
 *   and look for a marker from its text. A body that is present in the log and
 *   absent from every frame is the defect that shipped in 0.4.0.
 * - **No participant renders a blank row.** The roster gutter always shows
 *   something for a name the roster holds.
 * - **Nothing is drawn into a border.**
 *
 *   bun scripts/replay.ts <room.jsonl>
 *   bun scripts/replay.ts <room.jsonl> --widths 60,80,100,140
 */

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const logPath = process.argv[2];
if (!logPath || !existsSync(logPath)) {
  console.error("usage: bun scripts/replay.ts <room.jsonl> [--widths 60,80,100,140] [--height 30]");
  process.exit(1);
}

const WIDTHS = flag("widths", "60,80,100,140").split(",").map(Number);
const HEIGHT = Number(flag("height", "30"));

const { state, messages } = loadRoomLog(logPath);
console.log(
  `${logPath}: ${messages.length} messages, ${state.roster.length} participants, ` +
    `longest body ${Math.max(0, ...messages.map((m) => m.body.length))} chars`,
);

/** A marker unique to one message: its longest word, which wrapping cannot hide. */
function marker(body: string): string | null {
  const words = body.split(/\s+/).filter((w) => w.length >= 8 && /^[\p{L}\p{N}]+$/u.test(w));
  return words.sort((a, b) => b.length - a.length)[0] ?? null;
}

interface Problem {
  width: number;
  what: string;
  detail: string;
}
const problems: Problem[] = [];

for (const width of WIDTHS) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width, height: HEIGHT });
  const chat = new ChatView(renderer, { width, height: HEIGHT });
  renderer.root.add(chat.node);
  chat.setGoalContract(state.goal_contract);
  chat.setRoster(state.roster);
  chat.appendMessages(messages);
  await renderOnce();

  // Walk the whole transcript, a page at a time, collecting every frame.
  const frames: string[] = [];
  chat.scrollToTop();
  await renderOnce();
  frames.push(captureCharFrame());
  for (let i = 0; i < messages.length * 4; i += 1) {
    const before = frames[frames.length - 1];
    chat.scrollByLines(Math.max(1, Math.floor(chat.pageSize() / 2)));
    await renderOnce();
    const frame = captureCharFrame();
    frames.push(frame);
    if (frame === before) break;
  }
  const seen = frames.join("\n");

  let missing = 0;
  for (const message of messages) {
    const m = marker(message.body);
    if (m && !seen.includes(m)) {
      missing += 1;
      if (missing <= 3) {
        problems.push({ width, what: "a message body never reached the screen", detail: `seq ${message.seq}: "${m}"` });
      }
    }
  }
  if (missing > 3) problems.push({ width, what: "…and more bodies missing", detail: `${missing} in total` });

  if (chat.isRosterVisible()) {
    const gutter = frames[0]!.split("\n").slice(1, 1 + state.roster.length).map((line) => line.slice(0, 24));
    gutter.forEach((row, i) => {
      if (row.trim().replace(/^>\s*/, "").length === 0) {
        problems.push({ width, what: "a participant rendered a blank row", detail: state.roster[i]?.name ?? `#${i}` });
      }
    });
  }

  for (const frame of frames) {
    for (const line of frame.split("\n")) {
      const t = line.trim();
      if ((t.startsWith("└") || t.startsWith("┌")) && !/^[┌└][─]+[┐┘]$/.test(t)) {
        problems.push({ width, what: "content drawn into a border", detail: t.slice(0, 60) });
      }
    }
  }

  const bodiesFound = messages.filter((m) => {
    const k = marker(m.body);
    return k !== null && seen.includes(k);
  }).length;
  const checkable = messages.filter((m) => marker(m.body) !== null).length;
  console.log(`  width ${String(width).padStart(4)}: ${frames.length} frames, ${bodiesFound}/${checkable} bodies seen`);

  renderer.destroy();
}

console.log("");
if (problems.length === 0) {
  console.log(`REPLAY PASS — ${messages.length} real messages at ${WIDTHS.length} widths.`);
} else {
  const shown = problems.slice(0, 12);
  for (const p of shown) console.log(`REPLAY FAIL — width ${p.width}: ${p.what} — ${p.detail}`);
  if (problems.length > shown.length) console.log(`…and ${problems.length - shown.length} more`);
  process.exit(1);
}
