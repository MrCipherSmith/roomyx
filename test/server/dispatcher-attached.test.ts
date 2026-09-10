import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let handle: ServeHandle | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

async function stateFrom(url: string): Promise<Record<string, unknown>> {
  const client = new Client({ name: "dispatcher-attached-test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const result = await client.callTool({ name: "room.get_state", arguments: {} });
  const text = (result.content as Array<{ text: string }>)[0]?.text ?? "{}";
  await client.close();
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * `room.get_state` used to be silent about whether anything was dispatching into
 * the room — the server knew (`options.onOwnerCommand !== undefined`) and did not
 * say. That silence is why `room append` had to hedge its refusal ("If it has a
 * dispatcher…") and why the override flag could not be removed: without this
 * field, a live room with no writer and a live room with a writer look identical
 * from outside, so the dangerous case had to be spelled the same way as the
 * harmless one.
 */
describe("room.get_state reports whether a dispatcher is attached", () => {
  test("a bare `roomyx serve` says false", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    expect(await stateFrom(handle.url)).toHaveProperty("dispatcherAttached", false);
  });

  test("a server embedded by a dispatching host says true", async () => {
    handle = await serve(FIXTURE, { port: 0, onOwnerCommand: () => ({ accepted: true }) });
    expect(await stateFrom(handle.url)).toHaveProperty("dispatcherAttached", true);
  });
});
