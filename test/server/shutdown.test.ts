import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");
const CLI = join(import.meta.dir, "..", "..", "src", "cli.ts");

/**
 * `roomyx serve` did not exit on a signal whenever a client was attached —
 * which is the normal state of a served room.
 *
 * `httpServer.close()`'s callback fires only after every connection has ended,
 * and the code that ended them was *inside* that callback. An MCP client holds
 * a keep-alive socket, so the callback never fired. The operator's Ctrl-C
 * appeared to do nothing, the port stayed bound, and the SIGKILL that ended it
 * skipped deregistration.
 *
 * The pre-existing lifecycle test signalled with nothing attached — the one
 * case that always worked.
 */

let handle: ServeHandle | undefined;
let client: Client | undefined;
const dirs: string[] = [];
const procs: ReturnType<typeof Bun.spawn>[] = [];

afterEach(async () => {
  await client?.close().catch(() => undefined);
  client = undefined;
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

describe("shutting a served room down", () => {
  test("close() resolves with a client attached", async () => {
    handle = await serve(FIXTURE, { port: 0 });
    // A plain connected Client, which holds the standalone SSE GET stream open.
    // That stream is what pinned the process, and it is what a polling client
    // does *not* reliably hold between its short requests — measured both ways
    // against the old code: bare client hangs, poller does not.
    client = new Client({ name: "shutdown-test", version: "0.1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)));
    await new Promise((resolve) => setTimeout(resolve, 300));

    const settled = await Promise.race([
      handle.close().then(() => "closed"),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 5000)),
    ]);
    handle = undefined;
    expect(settled).toBe("closed");
  }, 20000);

  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    test(`${signal} exits the process and deregisters, with a client attached`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "roomyx-shutdown-"));
      dirs.push(dir);
      const registryPath = join(dir, "registry.json");

      const proc = Bun.spawn(["bun", CLI, "serve", FIXTURE, "--port", "0", "--registry", registryPath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      procs.push(proc);

      const deadline = Date.now() + 8000;
      let port = 0;
      while (Date.now() < deadline && port === 0) {
        try {
          const rooms = (JSON.parse(readFileSync(registryPath, "utf8")) as { rooms: Array<{ port: number }> }).rooms;
          if (rooms.length > 0 && rooms[0]) port = rooms[0].port;
        } catch {
          // not written yet
        }
        if (port === 0) await new Promise((r) => setTimeout(r, 50));
      }
      expect(port).toBeGreaterThan(0);

      // The precondition the old test never established: something is attached
      // and holding a stream open.
      const attached = new Client({ name: "shutdown-test", version: "0.1.0" });
      await attached.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
      await new Promise((resolve) => setTimeout(resolve, 300));

      proc.kill(signal);
      const outcome = await Promise.race([
        proc.exited.then(() => "exited"),
        new Promise((resolve) => setTimeout(() => resolve("hung"), 8000)),
      ]);
      await attached.close().catch(() => undefined);

      expect(outcome).toBe("exited");
      // SIGHUP is in this loop because closing a terminal is how a person
      // ordinarily ends a serve, and it had no handler at all.
      const rooms = (JSON.parse(readFileSync(registryPath, "utf8")) as { rooms: unknown[] }).rooms;
      expect(rooms).toHaveLength(0);
    }, 30000);
  }
});
