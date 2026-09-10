import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");
const CLI = join(import.meta.dir, "..", "..", "src", "cli.ts");

/**
 * Gates that a mutation pass found surviving their own deletion.
 *
 * Each of these is correct code with a comment asserting it is load-bearing,
 * and until now nothing would have gone red if it were removed — so the comment
 * was the only thing protecting it, and the next author reads comments, not
 * intentions.
 */

let handle: ServeHandle | undefined;
const dirs: string[] = [];
const procs: ReturnType<typeof Bun.spawn>[] = [];

afterEach(async () => {
  await handle?.close().catch(() => undefined);
  handle = undefined;
  for (const proc of procs) {
    if (proc.exitCode === null) {
      proc.kill("SIGKILL");
      await proc.exited.catch(() => undefined);
    }
  }
  procs.length = 0;
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

async function status(url: string, headers: Record<string, string> = {}): Promise<number> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  await response.text();
  return response.status;
}

describe("the transport's own gates", () => {
  // There was a case here asserting that `transport.onclose` drops the session
  // when a client closes without a DELETE. It does not, and measuring beat
  // assuming: a client that calls `close()` leaves its session answering 200
  // after 300 ms, 1s and 3s. The server never learns the client went away —
  // there is no connection to lose once the request has been answered. So
  // `onclose` is belt-and-braces for a transport that closes for its own
  // reasons, the sweeper is what catches an abandoned client, and the comment
  // on that handler has been corrected to say so rather than to claim a
  // coverage it does not have.

  test("the unknown-session 404 is validated like every other response", async () => {
    // It used to return before `handleRequest`, which is where the SDK checks
    // Host and Origin — so this was the one response path the rebinding guard
    // never saw. Nothing was exploitable, but "every path except one" is the
    // property that stops being true quietly.
    handle = await serve(FIXTURE, { port: 0 });
    expect(await status(handle.url, { "mcp-session-id": "nope", host: "evil.example" })).toBe(403);
    expect(await status(handle.url, { "mcp-session-id": "nope", origin: "http://evil.example" })).toBe(403);
    // And with honest headers it is still a 404, not a new session.
    expect(await status(handle.url, { "mcp-session-id": "nope" })).toBe(404);
  }, 20000);

  test("a second signal during shutdown does not start a second one", async () => {
    // The client's guard is pinned by shutdown-order.test.ts; the CLI's copy of
    // the same guard was not, and the two had already drifted once.
    const dir = mkdtempSync(join(tmpdir(), "roomyx-gates-"));
    dirs.push(dir);
    const registryPath = join(dir, "registry.json");
    const proc = Bun.spawn(["bun", CLI, "serve", FIXTURE, "--port", "0", "--registry", registryPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    procs.push(proc);

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      try {
        if ((JSON.parse(readFileSync(registryPath, "utf8")) as { rooms: unknown[] }).rooms.length > 0) break;
      } catch {
        // not written yet
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    proc.kill("SIGTERM");
    proc.kill("SIGTERM");
    proc.kill("SIGINT");
    const outcome = await Promise.race([
      proc.exited.then(() => "exited"),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 8000)),
    ]);
    expect(outcome).toBe("exited");
    // One deregistration, and the file is intact rather than half-written by
    // two teardowns racing.
    const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as { rooms: unknown[] };
    expect(parsed.rooms).toHaveLength(0);
  }, 30000);
});
