import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";
import { RoomClient } from "../../src/client/mcp-client";
import type { ServeHandle } from "../../src/server/serve";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

/**
 * Sessions were never released.
 *
 * The map lost an entry only via `onsessionclosed`, which the SDK fires on an
 * HTTP DELETE, and nothing in roomyx sent one: `client.close()` aborts the local
 * controller, and `terminateSession()` — the method that sends the DELETE — had
 * no callers anywhere. So every session a `roomyx serve` ever accepted was
 * retained for the life of the process, fed by ordinary use: one per
 * `rooms list`, one per `room append`, one per client start, one per reconnect.
 *
 * The memory was the smaller half. Each abandoned id stayed a fully routable
 * handle to the room, so a session id that leaked once never expired.
 */

let handle: ServeHandle | undefined;

afterEach(async () => {
  await handle?.close().catch(() => undefined);
  handle = undefined;
});

async function connectAndClose(url: string): Promise<string> {
  const client = new Client({ name: "session-test", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  const sessionId = transport.sessionId ?? "";
  await transport.terminateSession().catch(() => undefined);
  await client.close().catch(() => undefined);
  return sessionId;
}

/** A raw POST replaying a session id, bypassing the SDK entirely. */
async function replay(url: string, sessionId: string): Promise<number> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  await response.text();
  return response.status;
}

describe("session lifetime", () => {
  test("a closed session stops being routable", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const sessionId = await connectAndClose(handle.url);
    expect(sessionId).not.toBe("");

    // It used to answer 200 with a full tools/list.
    expect(await replay(handle.url, sessionId)).toBe(404);
  }, 20000);

  test("an unknown session id is refused rather than granted a new transport", async () => {
    // The old handler minted a session for any unrecognised id. That transport
    // never entered the map, so it could not be closed even on shutdown — a
    // leak reachable by anyone sending a random header.
    handle = await serve(FIXTURE, { port: 0 });
    expect(await replay(handle.url, "not-a-session-that-ever-existed")).toBe(404);
  }, 20000);

  test("repeated connect-and-close cycles do not accumulate live sessions", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const ids: string[] = [];
    for (let i = 0; i < 8; i += 1) ids.push(await connectAndClose(handle.url));

    const statuses = await Promise.all(ids.map((id) => replay(handle!.url, id)));
    expect(statuses.every((status) => status === 404)).toBe(true);
  }, 30000);

  test("a live session still works — the release did not break the ordinary path", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const client = new Client({ name: "session-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(handle.url));
    await client.connect(transport);
    try {
      const result = await client.callTool({ name: "room.get_state", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(JSON.parse(text).roster.length).toBeGreaterThan(0);
    } finally {
      await transport.terminateSession().catch(() => undefined);
      await client.close().catch(() => undefined);
    }
  }, 20000);
});

/**
 * The originating defect was that `terminateSession()` had no callers — the
 * client closed locally and told the server nothing. The tests above prove the
 * *server* honours a DELETE, which was never in doubt; deleting the one client
 * call again left all 261 tests green. This drives the release through
 * `RoomClient` itself.
 *
 * Capturing the session id needs a way to see the header the client sends, so
 * the client is pointed at a one-request-deep proxy that records it and
 * forwards. That is a smaller price than exposing the transport on the class
 * just so a test can read it.
 */
describe("the client's own session release", () => {
  test("stop() ends the session on the server, not only locally", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const upstream = handle.url;

    const seen = new Set<string>();
    const proxy = Bun.serve({
      port: 0,
      async fetch(request) {
        const id = request.headers.get("mcp-session-id");
        if (id) seen.add(id);
        const target = new URL(upstream);
        // Rewrite Host, or the server's DNS-rebinding guard refuses the
        // forwarded request — correctly: it is a request whose Host names
        // somewhere other than where it arrived. That guard working is why the
        // first version of this test saw no session id at all.
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

    try {
      const client = new RoomClient(
        { url: `http://127.0.0.1:${proxy.port}/mcp`, stateIntervalMs: 50, transcriptIntervalMs: 50 },
        {},
      );
      client.start();
      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(seen.size).toBeGreaterThan(0);

      await client.stop();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Every session the client opened is gone from the server, so replaying
      // its id gets the 404 an unknown session gets.
      for (const id of seen) {
        expect(await replay(upstream, id)).toBe(404);
      }
    } finally {
      proxy.stop(true);
    }
  }, 30000);
});
