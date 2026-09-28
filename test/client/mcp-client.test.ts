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
      { url: activeHandle.url, token: activeHandle.token, stateIntervalMs: 20, transcriptIntervalMs: 20 },
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
      { url: activeHandle.url, token: activeHandle.token, stateIntervalMs: 500, transcriptIntervalMs: 15 },
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
    // The room stays up the whole time and the ENDPOINT is what goes away and
    // comes back — a listener that appears in front of a running room.
    //
    // This used to close the server and re-serve on the same port, which is no
    // longer the same scenario: `serve()` mints a per-room token per process
    // start (AC10), so the second server is a different room with a different
    // credential, and a client holding the first one would be refused by design
    // rather than reconnecting. The property under test is unchanged — a client
    // that lost its endpoint reconnects when the endpoint answers again — and it
    // is now tested against an endpoint returning rather than against a token
    // silently staying valid across a restart, which it must not.
    activeHandle = await serve(FIXTURE, { port: 0 });
    const upstream = activeHandle.url;
    const token = activeHandle.token;

    // A port nothing is listening on yet. Claimed and released, so nothing else
    // on the machine is likely to take it in between.
    const placeholder = Bun.serve({ port: 0, fetch: () => new Response("") });
    const port = placeholder.port;
    placeholder.stop(true);

    const statuses: string[] = [];
    activeClient = new RoomClient(
      { url: `http://127.0.0.1:${port}/mcp`, token, stateIntervalMs: 30, transcriptIntervalMs: 30 },
      { onConnectionChange: (status) => statuses.push(status) },
    );
    activeClient.start();
    await waitFor(() => statuses.includes("disconnected"), 2000);

    // The endpoint appears: a pass-through to the room that has been running all
    // along, forwarding the client's own headers — the token included, which is
    // what makes the reconnect succeed.
    const proxy = Bun.serve({
      port,
      async fetch(request) {
        const target = new URL(upstream);
        const headers = new Headers(request.headers);
        // Or the room's rebinding guard refuses a request whose Host names the
        // proxy — which is that guard being right.
        headers.set("host", target.host);
        headers.delete("origin");
        return fetch(target, {
          method: request.method,
          headers,
          body: request.method === "GET" || request.method === "DELETE" ? undefined : await request.arrayBuffer(),
        });
      },
    });
    try {
      await waitFor(() => statuses.at(-1) === "connected", 5000);
    } finally {
      proxy.stop(true);
    }
  }, 20000);
});
