import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
      const transcript = JSON.parse(transcriptText) as {
        messages: Array<{ seq: number }>;
        has_more: boolean;
        next_seq: number;
      };
      expect(transcript.messages.map((m) => m.seq)).toEqual([3, 4]);
      // The page shape, over the wire rather than through the tool: a caller
      // that cannot tell a page from a complete answer is the defect the shape
      // exists to prevent, and it would be invisible in a unit test of the tool.
      expect(transcript.has_more).toBe(false);
      expect(transcript.next_seq).toBe(4);

      // An explicit limit pages over the wire too, and reports the cursor.
      const pagedResult = await client.callTool({
        name: "room.get_transcript",
        arguments: { since_seq: 0, limit: 2 },
      });
      const pagedText = (pagedResult.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      const paged = JSON.parse(pagedText) as { messages: Array<{ seq: number }>; has_more: boolean; next_seq: number };
      expect(paged.messages.map((m) => m.seq)).toEqual([1, 2]);
      expect(paged.has_more).toBe(true);
      expect(paged.next_seq).toBe(2);

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

  test("supports multiple sequential client sessions against one long-lived instance (regression: liveness-check-then-attach)", async () => {
    // Reproduces the exact failure an independent reviewer found: a first
    // client connecting and disconnecting (e.g. a liveness check) must not
    // burn the transport for every client after it. Two fully independent
    // connect->call->close cycles, one after the other, both to the SAME
    // serve() instance, must both succeed.
    const handle = await serve(FIXTURE, { port: 0 });
    try {
      const first = await connectClient(handle.url);
      await first.callTool({ name: "room.get_state", arguments: {} });
      await first.close();

      const second = await connectClient(handle.url);
      const result = await second.callTool({ name: "room.get_state", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(JSON.parse(text).roster).toHaveLength(3);
      await second.close();
    } finally {
      await handle.close();
    }
  });
});

describe("a log serve cannot read", () => {
  test("is refused before a port is bound, naming the file", async () => {
    // Found while writing prompts for an operator: the bundled skill told a
    // dispatcher to keep the transcript in markdown, and `roomyx serve` on a
    // markdown file *succeeded*. It bound a port, printed a room ID and an
    // attach command — and then every tool call threw. Because the liveness
    // probe treats a throwing `room.get_state` as "not this room", `roomyx
    // rooms list` answered "No live rooms" about a server that was running,
    // and the client refused to attach to the id it had just printed.
    //
    // A room that is invisible and says nothing about why is worse than one
    // that never started.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-serve-bad-"));
    const path = join(dir, "room.md");
    writeFileSync(path, "# Room\n\n**Ann:** hello\n");

    await expect(serve(path, { port: 0 })).rejects.toThrow(path);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a missing log is a sentence, not a stack trace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roomyx-serve-missing-"));
    const path = join(dir, "nope.jsonl");

    let message = "";
    await serve(path, { port: 0 }).catch((error: unknown) => {
      message = error instanceof Error ? error.message : String(error);
    });
    expect(message).toContain(path);
    // It says what to do, because a typo'd path is the most ordinary way to
    // reach this and the fix is one command.
    expect(message).toContain("roomyx room new");
    expect(message).not.toContain("ENOENT");
    rmSync(dir, { recursive: true, force: true });
  });
});
