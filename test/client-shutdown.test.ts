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

/**
 * Reads the client's stdout until its painted frame satisfies `predicate`.
 *
 * The frame arrives as escape sequences, so it is stripped before matching —
 * the roster name from the fixture is the cheapest proof that the client
 * connected, polled and painted.
 */
async function waitForFrame(
  proc: ReturnType<typeof Bun.spawn>,
  predicate: (frame: string) => boolean,
  timeoutMs = 15000,
): Promise<{ consumed: string; rest: ReadableStreamDefaultReader<Uint8Array> }> {
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let consumed = "";
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error("client stdout ended before it painted");
    consumed += decoder.decode(value, { stream: true });
    const plain = consumed.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b./g, "");
    // Returns the reader as well as what it already took: the stream can only
    // be consumed once, and the assertions below need the rest of it.
    if (predicate(plain)) return { consumed, rest: reader };
    if (Date.now() > deadline) throw new Error("timed out waiting for the client to paint");
  }
}

/** Everything left on a reader `waitForFrame` handed back. */
async function drain(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
  }
}

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

      // The precondition, established rather than hoped for. A fixed 2s wait
      // and three negative assertions meant a client still on its "connecting…"
      // frame satisfied every one of them — a silent green on the regression
      // gate for a defect that already shipped.
      const painted = await waitForFrame(client, (frame) => frame.includes("Омар"));
      client.kill(signal);

      const [rest, stderr] = await Promise.all([drain(painted.rest), new Response(client.stderr).text()]);
      await client.exited;

      const output = painted.consumed + rest + stderr;
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

    await waitForFrame(client, (frame) => frame.includes("Омар"));
    client.kill("SIGTERM");

    const exited = await Promise.race([
      client.exited.then(() => "exited"),
      new Promise((r) => setTimeout(() => r("hung"), 8000)),
    ]);
    expect(exited).toBe("exited");
  }, 20000);
});
