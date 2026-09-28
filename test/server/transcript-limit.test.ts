import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let handle: ServeHandle | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close().catch(() => undefined);
  client = undefined;
  await handle?.close().catch(() => undefined);
  handle = undefined;
});

/**
 * Asks for a transcript page and says only whether the call was refused, so the
 * test does not depend on which of the two shapes a rejected input takes — a
 * thrown `McpError` or an `isError` result are both "the schema said no".
 */
async function transcript(
  args: Record<string, unknown>,
): Promise<{ refused: boolean; why: string; payload: string }> {
  try {
    const result = await (client as Client).callTool({ name: "room.get_transcript", arguments: args });
    const text = (result.content as Array<{ text?: string }> | undefined)?.[0]?.text ?? "";
    return { refused: result.isError === true, why: text, payload: text };
  } catch (error) {
    return { refused: true, why: error instanceof Error ? error.message : String(error), payload: "" };
  }
}

/**
 * `limit: 0` is a cursor that never moves (AC12).
 *
 * The tool's own description tells a caller how to page: "pass next_seq back as
 * since_seq to continue". `limit` is declared `z.number().int().min(0)`, so zero
 * is a legal request, and a legal request for zero messages answers
 * `{messages: [], has_more: true, next_seq: <the since_seq you sent>}`. A client
 * following the documented loop then sends the same cursor again, forever: no
 * progress, no error, and `has_more` insisting there is more to come. Nothing in
 * the room log makes it stop.
 *
 * D-12 deferred `limit` once and shipped the paging half of it; the bound it
 * skipped is the one that makes the loop terminate.
 */
describe("room.get_transcript's limit", () => {
  test("limit: 0 is refused by the input schema", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    client = new Client({ name: "roomyx-limit-test", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));

    const zero = await transcript({ since_seq: 0, limit: 0 });

    expect(zero.refused).toBe(true);
    // Named, so an operator reading the refusal knows which argument to change.
    expect(zero.why).toContain("limit");
  }, 20000);

  test("the smallest page that makes progress is still accepted", async () => {
    // The converse, stated because a bound in the wrong place is the easy wrong
    // fix: `limit: 1` is a legal page and pages of one are how a slow consumer
    // drains a long room.
    handle = await serve(FIXTURE, { port: 0 });
    client = new Client({ name: "roomyx-limit-test", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));

    const one = await transcript({ since_seq: 0, limit: 1 });

    expect(one.refused).toBe(false);
    const page = JSON.parse(one.payload) as { messages: Array<{ seq: number }>; next_seq: number };
    expect(page.messages.map((m) => m.seq)).toEqual([1]);
    // The cursor advanced, which is the property `limit: 0` breaks.
    expect(page.next_seq).toBe(1);
  }, 20000);
});
