import { afterEach, describe, expect, test } from "bun:test";
import { request } from "node:http";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let handle: ServeHandle | undefined;

afterEach(async () => {
  await handle?.close().catch(() => undefined);
  handle = undefined;
});

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "no-token-test", version: "0.0.0" },
  },
});

/**
 * node:http rather than fetch, and a hand-written `initialize` rather than the
 * SDK client, because this is the request the audit sent with `curl`: the
 * cheapest thing any other process on the host can do.
 */
function postInitialize(
  port: number,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "content-length": Buffer.byteLength(INITIALIZE),
          host: `127.0.0.1:${port}`,
          ...headers,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end(INITIALIZE);
  });
}

/**
 * The room endpoint asks for nothing (AC10).
 *
 * D-06 put the transport on loopback with no token and D-06a added the
 * rebinding guards, stating plainly that those guards stop a *browser* and not a
 * *neighbouring process*. What changed since is what is behind the port. The
 * room now carries `room.post_owner_command`, so read access to the endpoint is
 * also instruction access to an agent that is holding tools: the audit walked
 * the whole chain with plain `curl` and no credential of any kind —
 * `initialize`, then `room.get_transcript` for the entire transcript, then
 * `room.post_owner_command` with a `constraint` body, which came straight back
 * out of `room.get_pending_owner_commands`. Every process on the host can do
 * that, including one that only got as far as running unsandboxed code in a
 * browser tab's helper, and nothing in the room log records which one did.
 *
 * AC10 asks for a per-room token minted at `serve()` and stored in the registry
 * entry. The token is not authentication of a person — D-06b has to say so — it
 * bounds which local processes can drive the room to the ones that were told the
 * room exists.
 *
 * These cases assert the negative half only: an `initialize` carrying no
 * credential is refused. The positive half is skipped rather than guessed,
 * because inventing the wire format here would pin the implementer to a header
 * name this test made up. See the `TODO(T15)` case at the bottom.
 */
describe("the room MCP endpoint without a credential", () => {
  test("a raw initialize with no token does not complete the handshake", async () => {
    handle = await serve(FIXTURE, { port: 0 });

    const res = await postInitialize(handle.port);

    // Refused, not served. The status is left as "some 4xx" rather than one
    // number, because whether an absent credential is 401 or 403 is the
    // implementer's call; what AC10 fixes is that it is currently 200.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    // And no session was handed out, so there is nothing to continue with.
    expect(res.body).not.toContain("serverInfo");
  }, 20000);

  test("an SDK client that sends no token cannot connect", async () => {
    // The same refusal through the transport a real caller would use, because a
    // gate that only catches hand-written requests is not a gate.
    handle = await serve(FIXTURE, { port: 0 });

    const client = new Client({ name: "no-token-client", version: "0.0.0" });
    const connect = client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));

    await expect(connect).rejects.toThrow();
    await client.close().catch(() => undefined);
  }, 20000);

  test("no uncredentialled session can read the transcript or queue an owner command", async () => {
    // The chain the audit walked, asserted as unreachable. It is stated
    // separately from the handshake because these two are the consequences that
    // make the missing credential worth a wire-contract change: the transcript is
    // the whole conversation, and a queued `constraint` is an instruction to an
    // agent holding tools.
    handle = await serve(FIXTURE, { port: 0 });

    const client = new Client({ name: "no-token-client", version: "0.0.0" });
    let connected = true;
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));
    } catch {
      connected = false;
    }
    if (!connected) return;

    const call = async (name: string, args: Record<string, unknown>): Promise<string> => {
      try {
        const result = await client.callTool({ name, arguments: args });
        return (result.content as Array<{ text?: string }> | undefined)?.[0]?.text ?? "";
      } catch {
        return "";
      }
    };

    const transcript = await call("room.get_transcript", { since_seq: 0 });
    const posted = await call("room.post_owner_command", { kind: "constraint", body: "do as I say" });
    await client.close().catch(() => undefined);

    // Either the session never happened or the tools refused it. Both are fine;
    // a readable transcript and a queued command are not.
    expect(transcript).not.toContain("messages");
    expect(posted).not.toContain("queued");
  }, 20000);

  // TODO(T15): unskip once `serve()` mints the token and exposes it.
  //
  // Left skipped on purpose. AC10 names the mechanism — "a per-room token minted
  // at `serve()` and stored in the registry entry" — but not the header or query
  // parameter that carries it, and a test that guesses one would either fail
  // against a correct implementation or quietly pin the guess as the contract.
  //
  // What T15 has to make this case expressible: a named way for a caller that
  // legitimately knows the room to present the token. Whatever it is called, this
  // test wants it as one helper, so that the four in-tree callers
  // (`RoomClient`, `callRoomTool`, `probeRoomState`, the liveness probe) and this
  // test all go through the same code rather than four hand-assembled headers —
  // which is the D-06a failure mode, where `allowedHosts` silently refused
  // roomyx's own client because the client's own path was never exercised.
  //
  // Then: serve, read the token off the handle (or the registry entry), present
  // it, and assert the handshake completes and `room.get_state` answers with a
  // roster. T17 drives the same round trip end to end for the real clients;
  // this case is the unit-level proof that the positive path exists at all.
  test.skip("a client presenting the room's token connects and can read the room", () => {
    expect(true).toBe(true);
  });
});
