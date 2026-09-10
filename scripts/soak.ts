#!/usr/bin/env bun
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestRenderer } from "@opentui/core/testing";
import { Renderable } from "@opentui/core";
import { serve } from "../src/server/serve";
import { RoomClient } from "../src/client/mcp-client";
import { ChatView } from "../src/client/screens/chat-view";
import { appendMessage, createRoomLog } from "../src/log/write";
import { MESSAGE_KINDS } from "../src/log/schema";

/**
 * A soak harness, because the three worst defects this project shipped were all
 * invisible to a unit test **by construction**.
 *
 * - An idle client exhausted the native renderable pool and died after about
 *   2.7 hours — 3275 state polls, with nothing on screen changing.
 * - A server retained every session it ever accepted, growing across a working
 *   day of ordinary `rooms list` calls.
 * - One malformed log line took a client from 1 connection to 510 in ten
 *   seconds.
 *
 * Every one is a function of *volume over time*. The suite's longest test runs
 * forty seconds and asserts a state, and no amount of care in writing more of
 * those would have caught any of the three.
 *
 * **The trick that makes this affordable is compressing the clock by poll count
 * rather than by wall time.** The 2.7-hour death is 3275 polls at the default
 * three seconds; at 20 ms it is sixty-five seconds. So an hour of a live room
 * costs a minute here, and a working day costs about twenty.
 *
 * It asserts *trends*, not thresholds. A threshold has to be guessed and is
 * wrong on someone else's machine; "the renderable count is the same at poll
 * 3000 as at poll 500" is true or false everywhere.
 *
 *   bun scripts/soak.ts               # ~2 min, about 3 hours of a live room
 *   bun scripts/soak.ts --polls 20000 # ~7 min, about a working day
 */

interface Sample {
  poll: number;
  renderables: number;
  rss: number;
  requests: number;
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const POLLS = arg("polls", 6000);
const INTERVAL = arg("interval", 20);
const MESSAGE_EVERY = arg("message-every", 50);

function renderableCount(): number {
  return (Renderable as unknown as { renderablesByNumber: Map<number, unknown> }).renderablesByNumber.size;
}

/** Counts every request the client makes, so a storm is visible as a rate. */
function countingProxy(upstream: string) {
  let requests = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (request.method === "POST") requests += 1;
      const target = new URL(upstream);
      const headers = new Headers(request.headers);
      headers.set("host", target.host);
      headers.delete("origin");
      return fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "DELETE" ? undefined : await request.arrayBuffer(),
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}/mcp`, requests: () => requests, stop: () => server.stop(true) };
}

const dir = mkdtempSync(join(tmpdir(), "roomyx-soak-"));
const logPath = join(dir, "room.jsonl");
createRoomLog(logPath, {
  goalStatement: "Soak the client and the server for a long room",
  roster: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, name: `Agent ${i}` })),
});

const handle = await serve(logPath, { port: 0 });
const proxy = countingProxy(handle.url);
const { renderer, renderOnce } = await createTestRenderer({ width: 100, height: 30 });
const chat = new ChatView(renderer, { width: 100, height: 30 });
renderer.root.add(chat.node);

let polls = 0;
const client = new RoomClient(
  { url: proxy.url, stateIntervalMs: INTERVAL, transcriptIntervalMs: INTERVAL },
  {
    onStateUpdate: (state) => {
      polls += 1;
      chat.setGoalContract(state.goal_contract);
      chat.setRoster(state.roster);
    },
    onNewMessages: (messages) => chat.appendMessages(messages),
    onConnectionChange: (status) => chat.setConnectionStatus(status),
    onToolError: (message) => chat.appendSystemLine(message),
  },
);
client.start();

const samples: Sample[] = [];
let seq = 0;
const started = Date.now();

while (polls < POLLS) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  await renderOnce();

  // A live room is not silent. One message per N polls keeps the transcript
  // growing, which is the other axis the defects lived on.
  //
  // Catch up rather than test for equality: `polls` advances by about ten
  // between iterations, so `polls % MESSAGE_EVERY === 0` almost never held and
  // the first version of this harness appended nothing at all — it soaked the
  // poll loop and left the transcript empty, which is half a test that reads
  // like a whole one.
  const wanted = Math.floor(polls / MESSAGE_EVERY);
  while (seq < wanted) {
    seq += 1;
    appendMessage(logPath, {
      from: `a${seq % 5}`,
      kind: MESSAGE_KINDS[seq % MESSAGE_KINDS.length],
      body: `Turn ${seq}. `.repeat(6),
    });
  }

  if (samples.length === 0 || polls - samples[samples.length - 1]!.poll >= POLLS / 12) {
    const sample: Sample = {
      poll: polls,
      renderables: renderableCount(),
      rss: Math.round(process.memoryUsage().rss / 1048576),
      requests: proxy.requests(),
    };
    samples.push(sample);
    const elapsed = ((Date.now() - started) / 1000).toFixed(0);
    const roomHours = ((polls * 3) / 3600).toFixed(1);
    console.log(
      `poll ${String(sample.poll).padStart(6)} | ${elapsed}s elapsed | ~${roomHours}h of a live room | ` +
        `renderables ${String(sample.renderables).padStart(6)} | rss ${sample.rss}MB | requests ${sample.requests}`,
    );
  }
}

await client.stop();
renderer.destroy();
proxy.stop();
await handle.close();
rmSync(dir, { recursive: true, force: true });

// --- the verdicts, stated as trends rather than as thresholds ---

const early = samples[Math.floor(samples.length / 3)]!;
const late = samples[samples.length - 1]!;
const messagesSince = Math.floor((late.poll - early.poll) / MESSAGE_EVERY);

console.log("");
const failures: string[] = [];

// Each message legitimately allocates rows; polls must not.
const allocatedPerMessage = messagesSince > 0 ? (late.renderables - early.renderables) / messagesSince : 0;
console.log(
  `renderables per message between poll ${early.poll} and ${late.poll}: ${allocatedPerMessage.toFixed(2)} ` +
    `(a message is 2-3 rows; anything near ${(POLLS / MESSAGE_EVERY).toFixed(0)} means polls are allocating)`,
);
if (allocatedPerMessage > 8) failures.push("renderables grow faster than the transcript does");

const pollsSince = late.poll - early.poll;
const requestsPerPoll = pollsSince > 0 ? (late.requests - early.requests) / pollsSince : 0;
console.log(`requests per state poll: ${requestsPerPoll.toFixed(2)} (two loops, so ~2 is right; a storm climbs)`);
if (requestsPerPoll > 6) failures.push("the request rate is climbing — poll loops are multiplying");

const rssGrowth = late.rss - early.rss;
console.log(`rss growth over ${pollsSince} polls: ${rssGrowth}MB`);
if (rssGrowth > 200) failures.push(`rss grew ${rssGrowth}MB, which is not a transcript`);

console.log("");
if (failures.length === 0) {
  console.log(`SOAK PASS — ${POLLS} polls, about ${((POLLS * 3) / 3600).toFixed(1)} hours of a live room.`);
} else {
  for (const failure of failures) console.log(`SOAK FAIL — ${failure}`);
  process.exit(1);
}
