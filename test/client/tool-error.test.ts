import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { RoomClient } from "../../src/client/mcp-client";
import { createRoomLog } from "../../src/log/write";

/**
 * A tool-level error is not a lost connection.
 *
 * `callTool` never read `result.isError`, so a server that answered with an
 * error answered with prose that `JSON.parse` then choked on — and both poll
 * loops caught that as a dropped transport. Each called `handleDisconnect`,
 * each scheduled its own `connect()`, and each `connect()` started a fresh pair
 * of loops without stopping the running ones, so the loop count doubled per
 * fault. One malformed line in a room log took a single client to 510
 * connections in ten seconds while the server was up and answering.
 *
 * The text thrown away was the diagnosis: `Invalid "message" line 2 in <path>`
 * — the one sentence that would have told the operator to look at their log
 * rather than at their network.
 */

let handle: ServeHandle | undefined;
let client: RoomClient | undefined;
const dirs: string[] = [];

afterEach(async () => {
  await client?.stop();
  client = undefined;
  await handle?.close();
  handle = undefined;
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function poisonedLog(): string {
  const dir = mkdtempSync(join(tmpdir(), "roomyx-tool-error-"));
  dirs.push(dir);
  const path = join(dir, "room.jsonl");
  createRoomLog(path, { goalStatement: "tool errors are not disconnects", roster: [{ id: "a", name: "Ann" }] });
  // Written past the writer's own guard, because that is the state a log
  // reaches from a torn write or a hand edit — the guard stops roomyx creating
  // it, not the world.
  appendFileSync(path, `${JSON.stringify({ type: "message", seq: 1, from: "", body: "x" })}\n`);
  return path;
}

describe("a server that answers with an error", () => {
  test("does not read as a disconnect, and its text reaches the caller", async () => {
    handle = await serve(poisonedLog(), { port: 0 });

    const statuses: string[] = [];
    const toolErrors: string[] = [];
    client = new RoomClient(
      { url: handle.url, stateIntervalMs: 20, transcriptIntervalMs: 20 },
      {
        onConnectionChange: (status) => statuses.push(status),
        onToolError: (message) => toolErrors.push(message),
      },
    );
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // The room is reachable, so the client stays connected.
    expect(statuses).toContain("connected");
    expect(statuses).not.toContain("disconnected");

    // And the operator gets the sentence that names the actual problem.
    expect(toolErrors.length).toBeGreaterThan(0);
    expect(toolErrors[0]).toContain("line 2");
  }, 20000);

  test("keeps polling rather than tearing the connection down", async () => {
    handle = await serve(poisonedLog(), { port: 0 });
    const toolErrors: string[] = [];
    client = new RoomClient(
      { url: handle.url, stateIntervalMs: 20, transcriptIntervalMs: 20 },
      { onToolError: (message) => toolErrors.push(message) },
    );
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const first = toolErrors.length;
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Still retrying, so a log fixed under a running client recovers by itself.
    expect(toolErrors.length).toBeGreaterThan(first);
  }, 20000);

  test("a real transport loss still reads as a disconnect", async () => {
    // The other half of the distinction: this must not have been traded away.
    handle = await serve(poisonedLog(), { port: 0 });
    const statuses: string[] = [];
    client = new RoomClient(
      { url: handle.url, stateIntervalMs: 20, transcriptIntervalMs: 20 },
      { onConnectionChange: (status) => statuses.push(status) },
    );
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(statuses).toContain("connected");

    await handle.close();
    handle = undefined;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(statuses).toContain("disconnected");
  }, 20000);
});

describe("stopping the client", () => {
  test("no event fires after stop(), even with a poll in flight", async () => {
    // The three `if (this.stopped) return;` guards on the disconnect path are
    // what make this true, and deleting all three left the subprocess shutdown
    // test green — it asserts the absence of a stack trace, which a client that
    // never reached the race also satisfies.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-stop-"));
    dirs.push(dir);
    const path = join(dir, "room.jsonl");
    createRoomLog(path, { goalStatement: "stop under load", roster: [{ id: "a", name: "Ann" }] });
    handle = await serve(path, { port: 0 });

    let stopped = false;
    const afterStop: string[] = [];
    const record = (what: string) => {
      if (stopped) afterStop.push(what);
    };

    const roomClient = new RoomClient(
      { url: handle.url, stateIntervalMs: 5, transcriptIntervalMs: 5 },
      {
        onConnectionChange: () => record("connection"),
        onStateUpdate: () => record("state"),
        onNewMessages: () => record("messages"),
        onToolError: () => record("toolError"),
      },
    );
    roomClient.start();
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Kill the server first, so a poll is losing its connection at the moment
    // stop() runs — the window the guards exist for.
    await handle.close();
    handle = undefined;
    stopped = true;
    await roomClient.stop();

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(afterStop).toEqual([]);
  }, 20000);
});
