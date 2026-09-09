import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const CLIENT = join(import.meta.dir, "..", "src", "client", "index.ts");
const FIXTURE = join(import.meta.dir, "fixtures", "sample-room.jsonl");

let dir: string | undefined;
const procs: ReturnType<typeof Bun.spawn>[] = [];

afterEach(async () => {
  for (const proc of procs) {
    if (proc.exitCode === null) {
      proc.kill("SIGKILL");
      await proc.exited.catch(() => undefined);
    }
  }
  procs.length = 0;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function serveFixture(): Promise<{ registryPath: string }> {
  dir = mkdtempSync(join(tmpdir(), "roomyx-client-shutdown-"));
  const registryPath = join(dir, "registry.json");
  const server = Bun.spawn(["bun", CLI, "serve", FIXTURE, "--port", "0", "--registry", registryPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  procs.push(server);

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      if ((JSON.parse(readFileSync(registryPath, "utf8")) as { rooms: unknown[] }).rooms.length > 0) {
        return { registryPath };
      }
    } catch {
      // not written yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("server never registered");
}

/**
 * Found by running the TUI and killing it the way a person or a script does.
 *
 * The renderer was torn down while the poll loop was still running, so an
 * in-flight poll lost its connection during teardown, called
 * `handleDisconnect`, and wrote "disconnected" into an already-destroyed text
 * buffer — `TextBuffer is destroyed`, ten frames of stack, at someone who just
 * closed a window. `q` and Ctrl-C never hit it because that path stopped the
 * client first. Signals hit nothing at all, because there were no handlers.
 */
describe("the client's shutdown", () => {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    test(`${signal} exits without dumping a stack trace`, async () => {
      const { registryPath } = await serveFixture();

      const client = Bun.spawn(["bun", CLIENT, "--registry", registryPath], { stdout: "pipe", stderr: "pipe" });
      procs.push(client);

      // Let it connect and paint at least once, so teardown races a live poll.
      await new Promise((r) => setTimeout(r, 2000));
      client.kill(signal);

      const [stdout, stderr] = await Promise.all([
        new Response(client.stdout).text(),
        new Response(client.stderr).text(),
      ]);
      await client.exited;

      const output = stdout + stderr;
      expect(output).not.toContain("TextBuffer is destroyed");
      expect(output).not.toContain("handleDisconnect");
      // Nothing that looks like a stack frame from either roomyx or the renderer.
      expect(output).not.toMatch(/\n\s+at .+\.ts:\d+/);
    }, 20000);
  }

  test("it actually exits rather than being killed by the harness", async () => {
    const { registryPath } = await serveFixture();
    const client = Bun.spawn(["bun", CLIENT, "--registry", registryPath], { stdout: "pipe", stderr: "pipe" });
    procs.push(client);

    await new Promise((r) => setTimeout(r, 2000));
    client.kill("SIGTERM");

    const exited = await Promise.race([
      client.exited.then(() => "exited"),
      new Promise((r) => setTimeout(() => r("hung"), 8000)),
    ]);
    expect(exited).toBe("exited");
  }, 20000);
});
