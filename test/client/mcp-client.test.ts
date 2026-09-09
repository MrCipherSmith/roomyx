import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { RoomClient } from "../../src/client/mcp-client";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let activeHandle: ServeHandle | undefined;
let activeClient: RoomClient | undefined;

afterEach(async () => {
  await activeClient?.stop();
  activeClient = undefined;
  await activeHandle?.close();
  activeHandle = undefined;
});

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(check, 10);
    };
    check();
  });
}

describe("RoomClient", () => {
  test("connects, fetches state, and reports the roster (AC3 setup)", async () => {
    activeHandle = await serve(FIXTURE, { port: 0 });
    let sawState = false;
    activeClient = new RoomClient(
      { url: activeHandle.url, stateIntervalMs: 20, transcriptIntervalMs: 20 },
      {
        onStateUpdate: (state) => {
          if (state.roster.length === 3) sawState = true;
        },
      },
    );
    activeClient.start();
    await waitFor(() => sawState);
  });

  test("delivers all messages exactly once across multiple poll cycles, no duplicates (AC3)", async () => {
    activeHandle = await serve(FIXTURE, { port: 0 });
    const seenSeqs: number[] = [];
    activeClient = new RoomClient(
      { url: activeHandle.url, stateIntervalMs: 500, transcriptIntervalMs: 15 },
      {
        onNewMessages: (messages) => {
          for (const m of messages) seenSeqs.push(m.seq);
        },
      },
    );
    activeClient.start();
    await waitFor(() => seenSeqs.length >= 4, 3000);
    // Give it a few more poll cycles to prove it does NOT re-deliver.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(seenSeqs).toEqual([1, 2, 3, 4]);
    expect(new Set(seenSeqs).size).toBe(seenSeqs.length);
  });

  test("reports a distinguishable disconnected state when the server is unreachable, without throwing (AC4)", async () => {
    // Never actually listen on this port.
    const deadUrl = "http://127.0.0.1:1/mcp";
    const statuses: string[] = [];
    activeClient = new RoomClient(
      { url: deadUrl, stateIntervalMs: 20, transcriptIntervalMs: 20 },
      { onConnectionChange: (status) => statuses.push(status) },
    );
    // start() must not throw synchronously or via an unhandled rejection.
    expect(() => activeClient?.start()).not.toThrow();
    await waitFor(() => statuses.includes("disconnected"), 2000);
  });

  test("recovers to connected after the server becomes reachable again (AC4)", async () => {
    activeHandle = await serve(FIXTURE, { port: 0 });
    const url = activeHandle.url;
    // Close it immediately so the first connection attempt fails.
    await activeHandle.close();
    activeHandle = undefined;

    const statuses: string[] = [];
    activeClient = new RoomClient(
      { url, stateIntervalMs: 30, transcriptIntervalMs: 30 },
      { onConnectionChange: (status) => statuses.push(status) },
    );
    activeClient.start();
    await waitFor(() => statuses.includes("disconnected"), 2000);

    // Re-serve on the SAME port so the client's next reconnect attempt succeeds.
    const port = Number(new URL(url).port);
    activeHandle = await serve(FIXTURE, { port });
    await waitFor(() => statuses.at(-1) === "connected", 3000);
  });
});
