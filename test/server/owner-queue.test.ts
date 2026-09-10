import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { OWNER_QUEUE_LIMIT } from "../../src/server/owner-queue";
import type { OwnerCommandResult } from "../../src/server/index";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let handle: ServeHandle | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

/**
 * Two clients, because one client cannot see this bug.
 *
 * `serveMcpOverHttp` calls `createMcpServer()` **once per session**, so anything
 * created inside `createRoomMcpServer` belongs to a single client. A queue built
 * there would accept the TUI's veto into a structure the dispatcher's own
 * session cannot read — a feature that passes every single-client test and does
 * nothing in the shape it exists for.
 */
async function connect(url: string): Promise<Client> {
  const client = new Client({ name: "owner-queue-test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

function jsonOf(result: unknown): unknown {
  const text = (result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
  return JSON.parse(text);
}

async function pending(client: Client): Promise<Array<{ id: string; kind: string; body: string }>> {
  return jsonOf(await client.callTool({ name: "room.get_pending_owner_commands", arguments: {} })) as Array<{
    id: string;
    kind: string;
    body: string;
  }>;
}

describe("an owner command posted in one session is readable in another", () => {
  test("the TUI's veto reaches the session that will act on it", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const tui = await connect(handle.url);
    const dispatcher = await connect(handle.url);

    const posted = (await tui.callTool({
      name: "room.post_owner_command",
      arguments: { kind: "veto", body: "not that direction" },
    })) as unknown;
    const result = jsonOf(posted) as OwnerCommandResult;
    expect(result.status).toBe("queued");

    const seen = await pending(dispatcher);
    expect(seen.map((c) => c.body)).toEqual(["not that direction"]);
    expect(seen[0]?.id).toBe(result.id);

    await tui.close();
    await dispatcher.close();
  }, 20000);

  test("a queued command is not reported as something nothing will act on", async () => {
    // The distinction the backlog demands: "nobody has read it yet" and "nothing
    // will act on this" are different answers and must not share a shape.
    handle = await serve(FIXTURE, { port: 0 });
    const client = await connect(handle.url);

    const result = jsonOf(
      await client.callTool({
        name: "room.post_owner_command",
        arguments: { kind: "constraint", body: "budget under 10k" },
      }),
    ) as OwnerCommandResult;

    expect(result.status).toBe("queued");
    expect(result.id).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("No dispatcher");
    await client.close();
  }, 20000);
});

describe("the queue is a resource as well as a tool", () => {
  test("resources/list advertises it, and reading it returns the same pending set", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const tui = await connect(handle.url);
    const reader = await connect(handle.url);
    await tui.callTool({ name: "room.post_owner_command", arguments: { kind: "veto", body: "stop" } });

    const list = (await reader.listResources()) as { resources: Array<{ uri: string }> };
    expect(list.resources.map((r) => r.uri)).toContain("room://owner-queue");

    const read = (await reader.readResource({ uri: "room://owner-queue" })) as {
      contents: Array<{ text?: string }>;
    };
    const fromResource = JSON.parse(read.contents[0]?.text ?? "[]") as Array<{ body: string }>;
    expect(fromResource.map((c) => c.body)).toEqual(["stop"]);
    expect((await pending(reader)).map((c) => c.body)).toEqual(["stop"]);

    await tui.close();
    await reader.close();
  }, 20000);
});

describe("acknowledging", () => {
  test("an acked command leaves the pending set", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const client = await connect(handle.url);
    const posted = jsonOf(
      await client.callTool({ name: "room.post_owner_command", arguments: { kind: "veto", body: "stop" } }),
    ) as OwnerCommandResult;
    expect(await pending(client)).toHaveLength(1);

    const acked = jsonOf(
      await client.callTool({ name: "room.ack_owner_command", arguments: { id: posted.id } }),
    ) as { acked: boolean };
    expect(acked.acked).toBe(true);
    expect(await pending(client)).toHaveLength(0);
    await client.close();
  }, 20000);

  test("an unknown id is refused rather than reported as success", async () => {
    // Reporting success for an id nobody queued would tell a dispatcher it had
    // settled something it never held — and it would stop looking.
    handle = await serve(FIXTURE, { port: 0 });
    const client = await connect(handle.url);

    const result = await client.callTool({ name: "room.ack_owner_command", arguments: { id: "cmd-nope" } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text ?? "").toContain("cmd-nope");
    await client.close();
  }, 20000);

  test("acking twice is refused the second time", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const client = await connect(handle.url);
    const posted = jsonOf(
      await client.callTool({ name: "room.post_owner_command", arguments: { kind: "veto", body: "stop" } }),
    ) as OwnerCommandResult;
    await client.callTool({ name: "room.ack_owner_command", arguments: { id: posted.id } });

    const second = await client.callTool({ name: "room.ack_owner_command", arguments: { id: posted.id } });
    expect(second.isError).toBe(true);
    await client.close();
  }, 20000);
});

describe("the handler is a second road into one queue", () => {
  test("a handler that accepts settles the command, and it is not left pending", async () => {
    const seen: string[] = [];
    handle = await serve(FIXTURE, {
      port: 0,
      onOwnerCommand: (command) => {
        seen.push(command.body);
        return { status: "accepted", reason: "acted on in round 3" };
      },
    });
    const client = await connect(handle.url);

    const result = jsonOf(
      await client.callTool({ name: "room.post_owner_command", arguments: { kind: "veto", body: "stop" } }),
    ) as OwnerCommandResult;
    expect(seen).toEqual(["stop"]);
    expect(result.status).toBe("accepted");
    expect(result.reason).toBe("acted on in round 3");
    // One delivery, not two: a settled command must not be waiting to be acted
    // on again by whoever reads the queue.
    expect(await pending(client)).toHaveLength(0);
    await client.close();
  }, 20000);

  test("a handler that refuses settles it too, and its reason survives", async () => {
    handle = await serve(FIXTURE, {
      port: 0,
      onOwnerCommand: () => ({ status: "refused", reason: "the room already converged" }),
    });
    const client = await connect(handle.url);

    const result = jsonOf(
      await client.callTool({ name: "room.post_owner_command", arguments: { kind: "goal_edit", body: "raise it" } }),
    ) as OwnerCommandResult;
    expect(result.status).toBe("refused");
    expect(result.reason).toBe("the room already converged");
    expect(await pending(client)).toHaveLength(0);
    await client.close();
  }, 20000);
});

describe("the queue is bounded", () => {
  test("a full queue refuses the next post, and says how many are waiting", async () => {
    // The server lives as long as the room, and a room runs for hours. A queue
    // nothing drains is the retention defect this project already fixed once in
    // the session map; a refusal an operator can see beats a leak nobody
    // measures.
    handle = await serve(FIXTURE, { port: 0 });
    const client = await connect(handle.url);

    for (let i = 0; i < OWNER_QUEUE_LIMIT; i += 1) {
      const result = jsonOf(
        await client.callTool({
          name: "room.post_owner_command",
          arguments: { kind: "constraint", body: `constraint ${i}` },
        }),
      ) as OwnerCommandResult;
      expect(result.status).toBe("queued");
    }

    const overflow = await client.callTool({
      name: "room.post_owner_command",
      arguments: { kind: "constraint", body: "one too many" },
    });
    expect(overflow.isError).toBe(true);
    const text = (overflow.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text).toContain(String(OWNER_QUEUE_LIMIT));

    // And the queue did not quietly grow past its bound.
    expect(await pending(client)).toHaveLength(OWNER_QUEUE_LIMIT);
    await client.close();
  }, 30000);

  test("acknowledging makes room again", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const client = await connect(handle.url);
    const first = jsonOf(
      await client.callTool({ name: "room.post_owner_command", arguments: { kind: "veto", body: "first" } }),
    ) as OwnerCommandResult;
    for (let i = 1; i < OWNER_QUEUE_LIMIT; i += 1) {
      await client.callTool({ name: "room.post_owner_command", arguments: { kind: "veto", body: `v${i}` } });
    }
    await client.callTool({ name: "room.ack_owner_command", arguments: { id: first.id } });

    const after = jsonOf(
      await client.callTool({ name: "room.post_owner_command", arguments: { kind: "veto", body: "room again" } }),
    ) as OwnerCommandResult;
    expect(after.status).toBe("queued");
    await client.close();
  }, 30000);
});

describe("nothing here writes the room log", () => {
  test("post, read, acknowledge and resource-read leave the file untouched", async () => {
    const before = readFileSync(FIXTURE, "utf8");
    const beforeMtime = statSync(FIXTURE).mtimeMs;

    handle = await serve(FIXTURE, { port: 0 });
    const client = await connect(handle.url);
    const posted = jsonOf(
      await client.callTool({ name: "room.post_owner_command", arguments: { kind: "veto", body: "stop" } }),
    ) as OwnerCommandResult;
    await client.callTool({ name: "room.get_pending_owner_commands", arguments: {} });
    await client.readResource({ uri: "room://owner-queue" });
    await client.callTool({ name: "room.ack_owner_command", arguments: { id: posted.id } });
    await client.close();

    // D-01: the server holds a queue, not a pen. The dispatcher is still the
    // log's only writer.
    expect(readFileSync(FIXTURE, "utf8")).toBe(before);
    expect(statSync(FIXTURE).mtimeMs).toBe(beforeMtime);
  }, 20000);
});
