import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../../src/server/serve";
import { createRoomLog } from "../../src/log/write";
import type { ServeHandle } from "../../src/server/serve";
import { RoomClient } from "../../src/client/mcp-client";

/**
 * An invariant check, and **not a regression barrier** — stated up front so
 * nobody reads it as one.
 *
 * A mutation pass reported that neither reconnect mechanism was pinned:
 * deleting the generation bump, the single-flight timer check, or both, left
 * every test green. It filed that as a coverage gap rather than as a returned
 * defect, because it could not reproduce the doubling either. This file was
 * written to close the gap by counting requests, which is the quantity the fix
 * actually bounds.
 *
 * **It does not close it.** Measured, stepwise, against a poisoned log with a
 * healthy connection — the defect's true shape, since a dead upstream makes
 * `connect()` throw so no poll loop ever starts:
 *
 * - remove the generation bump — green
 * - remove the single-flight check — green
 * - remove both — green
 * - remove those plus the client teardown in `handleDisconnect` — green
 * - remove all of that plus `callTool`'s `isError` handling, which is the whole
 *   pre-fix shape — **still green**
 *
 * So the original 510-connections-in-ten-seconds does not reproduce here, and
 * the honest conclusion is that this harness cannot produce it. What survives
 * is a cheap assertion that the request rate does not climb while a fault
 * persists: it would catch a gross regression and it pins no individual line.
 *
 * Kept rather than deleted because the assertion is real and costs one test.
 * Labelled rather than quietly shipped, because a test that reads as a barrier
 * and is not is the exact failure this round exists to stop repeating.
 */

let handle: ServeHandle | undefined;
let client: RoomClient | undefined;
const dirs: string[] = [];

afterEach(async () => {
  await client?.stop().catch(() => undefined);
  client = undefined;
  await handle?.close().catch(() => undefined);
  handle = undefined;
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

/** Counts POSTs reaching the room. */
function countingProxy(upstream: string) {
  let requests = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (request.method === "POST") requests += 1;
      const target = new URL(upstream);
      const headers = new Headers(request.headers);
      // Or the server's rebinding guard refuses a request whose Host names the
      // proxy — which is the guard being right.
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

describe("a persistent fault does not accelerate the client", () => {
  test("the request rate does not climb while a tool keeps failing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roomyx-rate-"));
    dirs.push(dir);
    const logPath = join(dir, "room.jsonl");
    createRoomLog(logPath, { goalStatement: "rate", roster: [{ id: "a", name: "Ann" }] });
    // A line the reader's schema refuses: the connection is healthy and the
    // tool call is not, which is the shape the defect needed.
    appendFileSync(logPath, `${JSON.stringify({ type: "message", seq: 1, from: "", body: "broken" })}\n`);

    handle = await serve(logPath, { port: 0 });
    const proxy = countingProxy(handle.url);
    try {
      client = new RoomClient({ url: proxy.url, stateIntervalMs: 100, transcriptIntervalMs: 100 }, {});
      client.start();
      await new Promise((resolve) => setTimeout(resolve, 800));

      const first = proxy.requests();
      await new Promise((resolve) => setTimeout(resolve, 800));
      const firstRate = proxy.requests() - first;
      expect(firstRate).toBeGreaterThan(0);

      const second = proxy.requests();
      await new Promise((resolve) => setTimeout(resolve, 800));
      const laterRate = proxy.requests() - second;

      // Doubling per fault would have this climbing without bound.
      expect(laterRate).toBeLessThan(firstRate * 2);
    } finally {
      proxy.stop();
    }
  }, 30000);
});
