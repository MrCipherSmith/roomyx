#!/usr/bin/env bun
// Watcher script: renders the live room log headlessly and dumps every
// screenful to a numbered .txt file. Read-only observer — never touches
// the repo or the room log itself.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createTestRenderer } from "@opentui/core/testing";
import { loadRoomLog } from "/home/altsay/roomyx/src/log/store";
import { ChatView } from "/home/altsay/roomyx/src/client/screens/chat-view";

const LOG_PATH = "/home/altsay/roomyx/.roomyx/rooms/logs/roomyx-review.jsonl";
const OUT_DIR = "/tmp/claude-1000/-home-altsay-roomyx/c3ee7b88-9d62-4016-ae8b-b9921c2cf2ad/scratchpad/screenshots";
const WIDTHS = [100, 72];
const HEIGHT = 30;

if (!existsSync(LOG_PATH)) {
  console.error(`log not found: ${LOG_PATH}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

const pass = Number(process.argv[2] ?? "1");
const timestamp = new Date().toISOString();

const { state, messages } = loadRoomLog(LOG_PATH);
console.log(
  `[pass ${pass} @ ${timestamp}] ${LOG_PATH}: ${messages.length} messages, ${state.roster.length} participants`,
);

for (const width of WIDTHS) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width, height: HEIGHT });
  const chat = new ChatView(renderer, { width, height: HEIGHT });
  renderer.root.add(chat.node);
  chat.setGoalContract(state.goal_contract);
  chat.setRoster(state.roster);
  chat.appendMessages(messages);
  await renderOnce();

  chat.scrollToTop();
  await renderOnce();

  const frames: string[] = [];
  frames.push(captureCharFrame());
  for (let i = 0; i < messages.length * 4 + 10; i += 1) {
    const before = frames[frames.length - 1];
    chat.scrollByLines(Math.max(1, Math.floor(chat.pageSize() / 2)));
    await renderOnce();
    const frame = captureCharFrame();
    frames.push(frame);
    if (frame === before) break;
  }

  frames.forEach((frame, idx) => {
    const fname = `${OUT_DIR}/pass${pass}_w${width}_frame${String(idx).padStart(2, "0")}.txt`;
    writeFileSync(fname, frame, "utf-8");
  });

  console.log(`  width ${width}: wrote ${frames.length} frames`);
  renderer.destroy();
}

console.log(`[pass ${pass}] done.`);
