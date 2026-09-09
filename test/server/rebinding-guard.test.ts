import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { serveManagement } from "../../src/mcp-management/server";

const BUNDLED_SKILL = join(import.meta.dir, "..", "fixtures", "bundled-skill.md");

/**
 * These assert the guard's EFFECT, not its configuration. An option present in
 * an object proves nothing — the whole reason this item exists is that a guard
 * can be set and silently fail to reach the transport. So every case here is a
 * real request against a really-running server.
 */

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let handle: ServeHandle | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "guard-test", version: "0.0.0" },
  },
});

/**
 * node:http rather than fetch, because fetch refuses to let a caller set
 * `Host` — and forging `Host` is exactly what a rebound page does.
 */
function post(port: number, headers: Record<string, string>): Promise<{ status: number; body: string }> {
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

describe("DNS-rebinding guard on the room transport", () => {
  test("a cross-origin page is refused with 403 and -32000, and does not complete the handshake", async () => {
    handle = await serve(FIXTURE, { port: 0 });

    const res = await post(handle.port, {
      host: `127.0.0.1:${handle.port}`,
      origin: "https://evil.example",
    });

    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe(-32000);
    // No session was handed out, so nothing was initialized.
    expect(res.body).not.toContain("serverInfo");
  });

  test("a rebound Host is refused even though its Origin is same-origin by then", async () => {
    handle = await serve(FIXTURE, { port: 0 });

    const res = await post(handle.port, {
      host: "roomyx.attacker.test",
      origin: `http://roomyx.attacker.test`,
    });

    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe(-32000);
  });

  test("the two guards are not redundant: each refuses a request the other lets through", async () => {
    handle = await serve(FIXTURE, { port: 0 });

    // Legitimate Host, hostile Origin — only allowedOrigins stops this.
    const browser = await post(handle.port, {
      host: `127.0.0.1:${handle.port}`,
      origin: "https://evil.example",
    });
    // Forged Host, and post-rebind the Origin looks same-origin — only
    // allowedHosts stops this one.
    const rebound = await post(handle.port, {
      host: "attacker.example",
      origin: "http://attacker.example",
    });

    expect(browser.status).toBe(403);
    expect(rebound.status).toBe(403);
  });

  test("roomyx's own client still connects — it sends no Origin, and the allowlist carries the bound port", async () => {
    handle = await serve(FIXTURE, { port: 0 });

    const client = new Client({ name: "roomyx-client", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));
    const result = await client.callTool({ name: "room.get_state", arguments: {} });
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain("roster");
    await client.close();
  });

  test("a port-less allowlist would have broken this: the Host header carries the port", async () => {
    handle = await serve(FIXTURE, { port: 0 });

    // Exactly what a legitimate client sends — host WITH the port. This is the
    // case an allowlist of bare hostnames returns 403 for, which is how the
    // naive fix bricks the product.
    const res = await post(handle.port, { host: `127.0.0.1:${handle.port}` });
    expect(res.status).not.toBe(403);
  });

  // The transport is shared now, so this is checking the wiring rather than the
  // mechanism — which is the point. The management server is the one that
  // exposes skill-sync, and it is the one that used to be missed.
  test("the management server is guarded too, from the same code", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roomyx-guard-mgmt-"));
    const registryPath = join(dir, "registry.json");
    const configPath = join(dir, "config.json");
    writeFileSync(registryPath, JSON.stringify({ schemaVersion: 1, rooms: [] }));
    writeFileSync(configPath, JSON.stringify({ schemaVersion: 1 }));

    const mgmt = await serveManagement(
      { registryPath, bundledSkillPath: BUNDLED_SKILL, configPath, cwd: dir },
      { port: 0 },
    );
    try {
      const res = await post(mgmt.port, {
        host: `127.0.0.1:${mgmt.port}`,
        origin: "https://evil.example",
      });
      expect(res.status).toBe(403);
      expect(JSON.parse(res.body).error.code).toBe(-32000);
    } finally {
      await mgmt.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
