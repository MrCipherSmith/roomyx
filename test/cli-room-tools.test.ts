import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callRoomTool } from "../src/installer/room-tool";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

/**
 * The three commands that let a dispatcher reach its own room.
 *
 * They exist because the bundled skill told a dispatcher to call
 * `room.get_delta_for` and to poll `room.get_pending_owner_commands`, and
 * nothing could: no CLI command exposed them, `.mcp.json` registers the
 * management server instead, and a room's own server binds an ephemeral port
 * recorded in the registry and nowhere else. The instruction was right about
 * what should happen and impossible to carry out.
 */


/**
 * **Opt-in, and CI runs them.**
 *
 * These start a real `roomyx serve` per test and spawn the CLI several times
 * over; they took the suite from ~25 s to ~88 s on their own. That cost is
 * honest — it is what testing a server end to end costs — but it is paid on
 * every unrelated edit, and a slow suite is one people stop running.
 *
 * So they are gated behind `ROOMYX_E2E=1` and wired into CI as their own step,
 * which is the part that matters: a test skipped by default and run nowhere is
 * a test that has been deleted slowly. `bun test` reports them as skipped
 * rather than passing them silently.
 *
 *   bun run test:e2e
 */
const E2E = process.env.ROOMYX_E2E === "1";

let dir: string;
let proc: ReturnType<typeof Bun.spawn> | undefined;

afterEach(async () => {
  if (proc && proc.exitCode === null) {
    proc.kill();
    await proc.exited.catch(() => undefined);
  }
  proc = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function run(args: string[]): { code: number; out: string; err: string } {
  const result = Bun.spawnSync(["bun", CLI, ...args], { cwd: dir });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}

/** A room with two participants, served, with `ann` having spoken twice. */
async function liveRoom(): Promise<{ log: string; registry: string; port: number }> {
  dir = mkdtempSync(join(tmpdir(), "roomyx-room-tools-"));
  const log = join(dir, "room.jsonl");
  const registry = join(dir, "registry.json");
  run(["room", "new", log, "--goal", "reachable tools", "--roster", "ann:Ann,ben:Ben"]);

  proc = Bun.spawn(["bun", CLI, "serve", log, "--port", "0", "--registry", registry], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const deadline = Date.now() + 8000;
  let port = 0;
  while (Date.now() < deadline && port === 0) {
    try {
      const parsed = JSON.parse(readFileSync(registry, "utf8")) as { rooms?: { port: number }[] };
      if (parsed.rooms?.[0]) port = parsed.rooms[0].port;
    } catch {
      // not written yet
    }
    if (port === 0) await new Promise((r) => setTimeout(r, 50));
  }
  expect(port).toBeGreaterThan(0);

  run(["room", "append", log, "--from", "ann", "--kind", "pitch", "--body", "first", "--registry", registry]);
  run(["room", "append", log, "--from", "ann", "--kind", "pitch", "--body", "second", "--registry", registry]);
  return { log, registry, port };
}

describe.skipIf(!E2E)("roomyx room delta", () => {
  test("returns what a participant has not seen, and says which cursor it used", async () => {
    const { log, registry } = await liveRoom();
    const { code, out } = run(["room", "delta", log, "--for", "ben", "--registry", registry]);

    expect(code).toBe(0);
    const delta = JSON.parse(out) as {
      found: boolean;
      messages: { body: string; from: string }[];
      since_seq: number;
      cursor_from: string;
    };
    expect(delta.found).toBe(true);
    expect(delta.messages.map((m) => m.body)).toEqual(["first", "second"]);
    // Ben has never spoken, so the cursor is 0 and it came from the convention
    // rather than from the caller — the distinction that makes an empty delta
    // readable instead of ambiguous.
    expect(delta.since_seq).toBe(0);
    expect(delta.cursor_from).toBe("agent-last-message");
  }, 30000);

  test("a participant is never told what it said itself", async () => {
    const { log, registry } = await liveRoom();
    const { out } = run(["room", "delta", log, "--for", "ann", "--since", "0", "--registry", registry]);
    const delta = JSON.parse(out) as { messages: { from: string }[]; cursor_from: string };

    // `--since 0` asks for everything, and everything in this room is Ann's.
    expect(delta.messages).toHaveLength(0);
    expect(delta.cursor_from).toBe("caller");
  }, 30000);

  test("without --for it refuses before it goes looking for a room", () => {
    // Deliberately no live room: the grammar check comes first, so this costs
    // no server. An e2e test that starts one anyway is ten seconds of the
    // suite's time buying nothing.
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-tools-argcheck-"));
    const log = join(dir, "room.jsonl");
    run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);

    const { code, err } = run(["room", "delta", log]);
    expect(code).toBe(1);
    expect(err).toContain("--for");
    expect(err).not.toContain("No live room");
  }, 30000);
});

describe.skipIf(!E2E)("roomyx room commands / ack", () => {
  test("an owner command posted from the TUI surface is listed, then settled", async () => {
    const { log, registry, port } = await liveRoom();

    // Posted the way the TUI posts it, so this exercises the real path rather
    // than a fixture: the owner presses `o`, the room queues it, and nothing
    // pushes it to the dispatcher.
    const posted = (await callRoomTool({ port }, "room.post_owner_command", {
      kind: "veto",
      body: "that thread is closed",
    })) as { id: string; status: string };
    expect(posted.status).toBe("queued");

    const listed = run(["room", "commands", log, "--registry", registry]);
    expect(listed.code).toBe(0);
    const pending = JSON.parse(listed.out) as { id: string; kind: string; body: string }[];
    expect(pending).toHaveLength(1);
    expect(pending[0]?.kind).toBe("veto");
    expect(pending[0]?.body).toBe("that thread is closed");

    const acked = run(["room", "ack", log, posted.id, "--registry", registry]);
    expect(acked.code).toBe(0);

    // `pending` has to keep meaning "not yet dealt with", or it grows forever
    // and stops being worth reading.
    const after = run(["room", "commands", log, "--registry", registry]);
    expect(JSON.parse(after.out)).toEqual([]);

    // Folded in rather than given its own room: it is the same server, and a
    // second one costs ten seconds to assert one sentence.
    const unknown = run(["room", "ack", log, "cmd-nope", "--registry", registry]);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain("cmd-nope");

    // And acking the same id twice is the same refusal — settled is settled.
    const again = run(["room", "ack", log, posted.id, "--registry", registry]);
    expect(again.code).toBe(1);
  }, 90000);
});

describe.skipIf(!E2E)("when no room is serving the log", () => {
  test("the refusal says why and how to start one", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-tools-dead-"));
    const log = join(dir, "room.jsonl");
    const registry = join(dir, "registry.json");
    run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);

    // These read the room's own server; a log on disk is not a room.
    for (const args of [
      ["room", "delta", log, "--for", "a"],
      ["room", "commands", log],
      ["room", "ack", log, "cmd-1"],
    ]) {
      const { code, err } = run([...args, "--registry", registry]);
      expect(code).toBe(1);
      expect(err).toContain("No live room is serving");
      expect(err).toContain("roomyx serve");
    }
  }, 30000);
});
