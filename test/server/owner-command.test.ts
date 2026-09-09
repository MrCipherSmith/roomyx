import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import type { OwnerCommand } from "../../src/server/index";

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
  test("with no dispatcher attached it refuses, and says why, instead of pretending acceptance", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    const client = await connect(handle.url);

    const result = await client.callTool({
      name: "room.post_owner_command",
      arguments: { kind: "veto", body: "not that direction" },
    });
    const parsed = JSON.parse(textOf(result));
    expect(parsed.accepted).toBe(false);
    expect(parsed.reason).toContain("No dispatcher");

    await client.close();
  });

  test("forwards the command to the dispatcher the host supplied, and returns its verdict", async () => {
    const seen: OwnerCommand[] = [];
    handle = await serve(FIXTURE, {
      port: 0,
      onOwnerCommand: (command) => {
        seen.push(command);
        return { accepted: true, reason: "queued for round 3" };
      },
    });
    const client = await connect(handle.url);

    const result = await client.callTool({
      name: "room.post_owner_command",
      arguments: { kind: "constraint", body: "budget under 10k" },
    });
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual({ accepted: true, reason: "queued for round 3" });
    expect(seen).toEqual([{ kind: "constraint", body: "budget under 10k" }]);

    await client.close();
  });

  test("rejects a kind outside the four the contract defines", async () => {
    handle = await serve(FIXTURE, { port: 0, onOwnerCommand: () => ({ accepted: true }) });
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

    handle = await serve(FIXTURE, { port: 0, onOwnerCommand: () => ({ accepted: true }) });
    const client = await connect(handle.url);
    await client.callTool({
      name: "room.post_owner_command",
      arguments: { kind: "goal_edit", body: "raise the pass threshold" },
    });
    await client.close();

    expect(readFileSync(FIXTURE, "utf8")).toBe(before);
  });
});
