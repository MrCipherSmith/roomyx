import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

async function connectClient(url: string): Promise<Client> {
  const client = new Client({ name: "roomyx-test-client", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

describe("serve", () => {
  test("binds to an ephemeral loopback port and prints/returns the bound address", async () => {
    const handle = await serve(FIXTURE, { port: 0 });
    try {
      expect(handle.port).toBeGreaterThan(0);
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    } finally {
      await handle.close();
    }
  });

  test("a real StreamableHTTPClientTransport can connect and call room.get_state (AC1)", async () => {
    const handle = await serve(FIXTURE, { port: 0 });
    try {
      const client = await connectClient(handle.url);
      const result = await client.callTool({ name: "room.get_state", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      const state = JSON.parse(text);
      expect(state.roster).toHaveLength(3);
      expect(state.goal_contract.version).toBe(1);
      await client.close();
    } finally {
      await handle.close();
    }
  });

  test("a real client can call room.get_transcript and room.get_agent_detail (AC1)", async () => {
    const handle = await serve(FIXTURE, { port: 0 });
    try {
      const client = await connectClient(handle.url);

      const transcriptResult = await client.callTool({
        name: "room.get_transcript",
        arguments: { since_seq: 2 },
      });
      const transcriptText = (transcriptResult.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      const transcript = JSON.parse(transcriptText);
      expect(transcript.map((m: { seq: number }) => m.seq)).toEqual([3, 4]);

      const agentResult = await client.callTool({
        name: "room.get_agent_detail",
        arguments: { agent_id: "yuki" },
      });
      const agentText = (agentResult.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      const agent = JSON.parse(agentText);
      expect(agent.found).toBe(true);

      await client.close();
    } finally {
      await handle.close();
    }
  });

  test("refuses to bind a non-loopback host without --acknowledge-non-loopback (AC2)", async () => {
    await expect(serve(FIXTURE, { port: 0, host: "0.0.0.0" })).rejects.toThrow(
      /non-loopback/,
    );
  });

  test("binds a non-loopback host when acknowledged (AC2, converse case)", async () => {
    const handle = await serve(FIXTURE, { port: 0, host: "0.0.0.0", acknowledgeNonLoopback: true });
    try {
      expect(handle.port).toBeGreaterThan(0);
    } finally {
      await handle.close();
    }
  });

  test("never writes to the room log file across a full connect+call+close cycle (AC7)", async () => {
    const { readFileSync, statSync } = await import("node:fs");
    const before = readFileSync(FIXTURE, "utf8");
    const beforeMtime = statSync(FIXTURE).mtimeMs;

    const handle = await serve(FIXTURE, { port: 0 });
    const client = await connectClient(handle.url);
    await client.callTool({ name: "room.get_state", arguments: {} });
    await client.callTool({ name: "room.get_transcript", arguments: { since_seq: 0 } });
    await client.close();
    await handle.close();

    const after = readFileSync(FIXTURE, "utf8");
    const afterMtime = statSync(FIXTURE).mtimeMs;
    expect(after).toBe(before);
    expect(afterMtime).toBe(beforeMtime);
  });
});
