import { describe, expect, test } from "bun:test";
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  test("a real client reads each participant's delta, and the description it is told (D-18 item 5)", async () => {
    const handle = await serve(FIXTURE, { port: 0 });
    try {
      const client = await connectClient(handle.url);

      const delta = async (args: Record<string, unknown>) => {
        const result = await client.callTool({ name: "room.get_delta_for", arguments: args });
        const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
        return JSON.parse(text) as {
          found: boolean;
          messages?: Array<{ seq: number; from: string }>;
          since_seq?: number;
          cursor_from?: string;
        };
      };

      // The fixture's three boundary cases, over the wire.
      expect((await delta({ agent_id: "yuki" })).messages?.map((m) => m.seq)).toEqual([4]);
      expect((await delta({ agent_id: "omar" })).messages?.map((m) => m.seq)).toEqual([3, 4]);
      expect((await delta({ agent_id: "zara" })).messages?.map((m) => m.seq)).toEqual([]);

      const explicit = await delta({ agent_id: "yuki", since_seq: 0 });
      expect(explicit.messages?.map((m) => m.seq)).toEqual([2, 4]);
      expect(explicit.cursor_from).toBe("caller");
      expect(explicit.messages?.every((m) => m.from !== "yuki")).toBe(true);

      expect((await delta({ agent_id: "nobody" })).found).toBe(false);

      // The description as a client is actually told it — the backlog files an
      // overclaiming description as a defect in its own right, and a string
      // assertion in the tool's own unit test cannot see what the wire says.
      const { tools } = await client.listTools();
      const described = tools.find((t) => t.name === "room.get_delta_for");
      expect(described).toBeDefined();
      const text = `${described?.description ?? ""}`.toLowerCase();
      // The framing: a convention, stated as such.
      expect(text).toContain("probably not seen");
      // The denial, which is what makes the framing honest. Checking for
      // forbidden WORDS would flag this very sentence — a disclaimer has to name
      // the thing it disclaims — so the check is for affirmative claims instead.
      expect(text).toContain("not as a delivery record");
      for (const claim of ["has been delivered", "was delivered to", "has received", "what was sent to it"]) {
        expect(text).not.toContain(claim);
      }

      await client.close();
    } finally {
      await handle.close();
    }
  }, 20000);

  test("a real client reads the folded state after an edit (D-20)", async () => {
    // The fold has to be visible where a room's state is actually read. A tool
    // unit test proves `loadRoomLog` folds; this proves `room.get_state` — the
    // thing the dispatcher and the status bar consume — returns the folded state.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-fold-serve-"));
    const logPath = join(dir, "room.jsonl");
    copyFileSync(FIXTURE, logPath);
    const header = JSON.parse(readFileSync(logPath, "utf8").split("\n")[0] as string);
    const raised = JSON.parse(JSON.stringify(header.goal_contract)) as { threshold: { pass_at_or_above: number } };
    raised.threshold.pass_at_or_above = 95;
    appendFileSync(
      logPath,
      `${JSON.stringify({
        type: "message",
        seq: 5,
        from: "owner",
        kind: "goal_edit",
        body: "raise the pass mark to 95",
        change: { type: "goal_contract", goal_contract: raised },
      })}\n`,
    );

    const handle = await serve(logPath, { port: 0 });
    try {
      const client = await connectClient(handle.url);
      const state = JSON.parse(
        ((await client.callTool({ name: "room.get_state", arguments: {} })).content as Array<{ text: string }>)[0]
          ?.text ?? "{}",
      ) as { goal_contract: { threshold: { pass_at_or_above: number }; updated_by?: string } };
      expect(state.goal_contract.threshold.pass_at_or_above).toBe(95);
      expect(state.goal_contract.updated_by).toBe("owner");

      // And the edit is in the transcript as an ordinary message, because that is
      // how a person sees what happened to the room.
      const page = JSON.parse(
        (
          (await client.callTool({ name: "room.get_transcript", arguments: { since_seq: 4 } })).content as Array<{
            text: string;
          }>
        )[0]?.text ?? "{}",
      ) as { messages: Array<{ kind?: string; body: string }> };
      expect(page.messages.map((m) => m.kind)).toEqual(["goal_edit"]);
      expect(page.messages[0]?.body).toBe("raise the pass mark to 95");

      await client.close();
      // Reading folded state is an interpretation: the file keeps the contract
      // the room was created with.
      expect(JSON.parse(readFileSync(logPath, "utf8").split("\n")[0] as string).goal_contract.threshold.pass_at_or_above).toBe(80);
    } finally {
      await handle.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

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
