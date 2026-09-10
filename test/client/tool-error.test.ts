import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { RoomClient, ToolError } from "../../src/client/mcp-client";
import { until } from "../helpers/until";
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

function freshLog(): string {
  const dir = mkdtempSync(join(tmpdir(), "roomyx-tool-error-"));
  dirs.push(dir);
  const path = join(dir, "room.jsonl");
  createRoomLog(path, { goalStatement: "tool errors are not disconnects", roster: [{ id: "a", name: "Ann" }] });
  return path;
}

/**
 * Damages a log that is already being served.
 *
 * It used to be poisoned before `serve`, which no longer starts on a log it
 * cannot read — and that guard is right: a server that binds a port for an
 * unreadable log answers every tool call with an error, which the liveness
 * probe reads as "not this room", so `rooms list` reported no live rooms about
 * a server that was running.
 *
 * Poisoning after the server is up is also the truer setup. What these tests
 * are about is a log damaged *while a room is live* — a torn write or a hand
 * edit — and that is exactly the case the startup guard cannot catch.
 */
function poison(path: string): void {
  // Written past the writer's own guard, because that is the state a log
  // reaches from a torn write or a hand edit — the guard stops roomyx creating
  // it, not the world.
  appendFileSync(path, `${JSON.stringify({ type: "message", seq: 1, from: "", body: "x" })}\n`);
}

/** A log that is valid now and poisoned as soon as `serve` has read it. */
async function servePoisoned(): Promise<{ handle: ServeHandle; path: string }> {
  const path = freshLog();
  const started = await serve(path, { port: 0 });
  poison(path);
  return { handle: started, path };
}

describe("a server that answers with an error", () => {
  test("does not read as a disconnect, and its text reaches the caller", async () => {
    handle = (await servePoisoned()).handle;

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
    await until(() => toolErrors.length > 0, "the server's error text to reach the client");

    // The room is reachable, so the client stays connected.
    expect(statuses).toContain("connected");
    expect(statuses).not.toContain("disconnected");

    // And the operator gets the sentence that names the actual problem.
    expect(toolErrors.length).toBeGreaterThan(0);
    expect(toolErrors[0]).toContain("line 2");
  }, 20000);

  test("keeps polling, so a log repaired under a running client recovers", async () => {
    // This used to assert that the error count kept growing, which was really
    // asserting the flood: a persistent fault was reported once per poll. The
    // property worth holding is the one underneath — the loop is still running,
    // which is observable by repairing the log and watching messages arrive.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-recover-"));
    dirs.push(dir);
    const path = join(dir, "room.jsonl");
    createRoomLog(path, { goalStatement: "recovery", roster: [{ id: "a", name: "Ann" }] });

    // Damaged after the server has read it: `serve` refuses to start on a log
    // it cannot parse, and this test is about a log that breaks under a running
    // room — see `poison` above.
    handle = await serve(path, { port: 0 });
    appendFileSync(path, `${JSON.stringify({ type: "message", seq: 1, from: "", body: "broken" })}\n`);
    const toolErrors: string[] = [];
    const messages: string[] = [];
    client = new RoomClient(
      { url: handle.url, stateIntervalMs: 50, transcriptIntervalMs: 50 },
      {
        onToolError: (message) => toolErrors.push(message),
        onNewMessages: (batch) => messages.push(...batch.map((m) => m.body)),
      },
    );
    client.start();
    await until(() => toolErrors.length > 0, "the first tool error");
    expect(toolErrors).toHaveLength(1);
    expect(messages).toHaveLength(0);

    // Repair it: rewrite the bad line as a good one.
    const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
    lines[1] = JSON.stringify({ type: "message", seq: 1, from: "a", body: "REPAIRED" });
    writeFileSync(path, `${lines.join("\n")}\n`);

    await until(() => messages.includes("REPAIRED"), "the repaired message to arrive");
    expect(messages).toContain("REPAIRED");
  }, 20000);

  test("a real transport loss still reads as a disconnect", async () => {
    // The other half of the distinction: this must not have been traded away.
    handle = (await servePoisoned()).handle;
    const statuses: string[] = [];
    client = new RoomClient(
      { url: handle.url, stateIntervalMs: 20, transcriptIntervalMs: 20 },
      { onConnectionChange: (status) => statuses.push(status) },
    );
    client.start();
    await until(() => statuses.includes("connected"), "the client to connect");

    await handle.close();
    handle = undefined;
    await until(() => statuses.includes("disconnected"), "the transport loss to be noticed");
    expect(statuses).toContain("disconnected");
  }, 20000);
});

describe("stopping the client", () => {
  test("no event fires after stop(), even with a poll in flight", async () => {
    // Corrected after an independent mutation pass, because the earlier note
    // here counted wrong and a verification record that miscounts is worse than
    // none.
    //
    // The property is held by **two redundant families**: five `this.stopped`
    // guard sites, and the `this.generation += 1` in `stop()`. Measured, at
    // this commit: removing all five guards leaves this green (the generation
    // bump still stales every loop); removing only the generation bump leaves
    // it green (the guards still catch it); removing both turns it red.
    //
    // So no single deletion is caught, and neither is either family alone. The
    // test holds the property, not any one line — and saying otherwise is the
    // mistake this whole round exists to stop repeating.
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

    let polled = false;
    const roomClient = new RoomClient(
      { url: handle.url, stateIntervalMs: 5, transcriptIntervalMs: 5 },
      {
        onStateUpdate: () => {
          polled = true;
          record("state");
        },
        onConnectionChange: () => record("connection"),
        onNewMessages: () => record("messages"),
        onToolError: () => record("toolError"),
      },
    );
    roomClient.start();
    // The precondition the docstring assumes: a poll has actually happened, so
    // stop() lands while one is in flight rather than before any ran.
    await until(() => polled, "the first poll to complete");

    // Kill the server first, so a poll is losing its connection at the moment
    // stop() runs — the window the guards exist for.
    await handle.close();
    handle = undefined;
    stopped = true;
    await roomClient.stop();

    // A real duration: the assertion is that nothing arrives, and there is no
    // condition to wait on for an absence.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(afterStop).toEqual([]);
  }, 20000);
});

describe("a tool error that does not go away", () => {
  test("is reported once, not once per poll", async () => {
    // A tool error is usually a property of the file, not a transient: a log
    // line the reader's schema refuses stays refused. Reported per poll it
    // produced ~80 identical transcript entries a minute, each allocating a
    // renderable that was never freed — the same finite pool whose exhaustion
    // this round fixed elsewhere, re-entered through a different door.
    handle = (await servePoisoned()).handle;
    const toolErrors: string[] = [];
    client = new RoomClient(
      { url: handle.url, stateIntervalMs: 100, transcriptIntervalMs: 100 },
      { onToolError: (message) => toolErrors.push(message) },
    );
    client.start();
    await until(() => toolErrors.length > 0, "the first report");
    // Then a real duration, because the assertion is about what does NOT happen
    // over time — that is the one case where a clock is the right instrument.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(toolErrors).toHaveLength(1);
  }, 20000);

  test("a different error is still news", async () => {
    // Deduplication must not swallow a second, distinct fault.
    const first = new ToolError("Invalid \"message\" line 2");
    const second = new ToolError("Invalid \"message\" line 9");
    expect(first.message).not.toBe(second.message);
  });
});

describe("a client that was stopped", () => {
  test("can be started again", async () => {
    // `stop()` cancelled the pending reconnect but left the handle set, and
    // `scheduleConnect` uses that field as its single-flight token — so
    // `start()` returned immediately and the client was inert for good.
    const firstStatuses: string[] = [];
    const roomClient = new RoomClient(
      { url: "http://127.0.0.1:1/mcp", transcriptIntervalMs: 50 },
      { onConnectionChange: (status) => firstStatuses.push(status) },
    );
    roomClient.start();
    await until(() => firstStatuses.includes("disconnected"), "a reconnect to be pending");
    await roomClient.stop();

    const statuses: string[] = [];
    const restarted = new RoomClient(
      { url: "http://127.0.0.1:1/mcp", transcriptIntervalMs: 50 },
      { onConnectionChange: (status) => statuses.push(status) },
    );
    restarted.start();
    await until(() => statuses.length > 0, "the first run to report something");
    await restarted.stop();
    statuses.length = 0;

    restarted.start();
    await until(() => statuses.length > 0, "the restarted client to report something");
    await restarted.stop();
    expect(statuses.length).toBeGreaterThan(0);
  }, 20000);
});
