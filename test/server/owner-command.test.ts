import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import type { OwnerCommandEnvelope, OwnerCommandResult } from "../../src/server/index";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let handle: ServeHandle | undefined;
let dir: string | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function connect(url: string): Promise<Client> {
  const client = new Client({ name: "owner-command-test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

function textOf(result: unknown): string {
  return (result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
}

describe("room.post_owner_command (R5)", () => {
  test("with no dispatcher attached the command is queued, not discarded", async () => {
    // This case used to assert `accepted: false` with "No dispatcher is
    // attached". That answer was honest about the old behaviour and wrong about
    // the requirement: for the orchestrator this package targets, a bare
    // `serve` is the NORMAL case, so refusing meant the owner channel never
    // worked. The command is held now, and the response says so without
    // pretending anything has acted on it.
    handle = await serve(FIXTURE, { port: 0 });
    const client = await connect(handle.url);

    const result = await client.callTool({
      name: "room.post_owner_command",
      arguments: { kind: "veto", body: "not that direction" },
    });
    const parsed = JSON.parse(textOf(result)) as OwnerCommandResult;
    expect(parsed.status).toBe("queued");
    expect(parsed.id).toBeTruthy();
    expect(textOf(result)).not.toContain("No dispatcher");

    await client.close();
  });

  test("forwards the command to the dispatcher the host supplied, and returns its verdict", async () => {
    const seen: OwnerCommandEnvelope[] = [];
    handle = await serve(FIXTURE, {
      port: 0,
      onOwnerCommand: (command) => {
        seen.push(command);
        return { status: "accepted" as const, reason: "queued for round 3" };
      },
    });
    const client = await connect(handle.url);

    const result = await client.callTool({
      name: "room.post_owner_command",
      arguments: { kind: "constraint", body: "budget under 10k" },
    });
    const parsed = JSON.parse(textOf(result)) as OwnerCommandResult;
    expect(parsed.status).toBe("accepted");
    expect(parsed.reason).toBe("queued for round 3");
    expect(seen.map((c) => ({ kind: c.kind, body: c.body }))).toEqual([
      { kind: "constraint", body: "budget under 10k" },
    ]);
    // The handler is told which queue entry it is answering, so it can settle or
    // reference it — the two roads meet at one id.
    expect(seen[0]?.id).toBe(parsed.id);

    await client.close();
  });

  test("rejects a kind outside the four the contract defines", async () => {
    handle = await serve(FIXTURE, { port: 0, onOwnerCommand: () => ({ status: "accepted" as const }) });
    const client = await connect(handle.url);

    const result = await client.callTool({
      name: "room.post_owner_command",
      arguments: { kind: "delete_room", body: "x" },
    });
    // The SDK reports a schema violation as an error result rather than a
    // transport-level rejection; either way the handler must not have run.
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("kind");

    await client.close();
  });

  test("posting a command does not write to the room log — D-01's single-writer rule holds", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-owner-cmd-"));
    const before = readFileSync(FIXTURE, "utf8");

    handle = await serve(FIXTURE, { port: 0, onOwnerCommand: () => ({ status: "accepted" as const }) });
    const client = await connect(handle.url);
    await client.callTool({
      name: "room.post_owner_command",
      arguments: { kind: "goal_edit", body: "raise the pass threshold" },
    });
    await client.close();

    expect(readFileSync(FIXTURE, "utf8")).toBe(before);
  });
});
