import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

let dir: string | undefined;
const procs: ReturnType<typeof Bun.spawn>[] = [];

afterEach(async () => {
  for (const proc of procs) {
    if (proc.exitCode === null) {
      proc.kill("SIGTERM");
      await proc.exited.catch(() => undefined);
    }
  }
  procs.length = 0;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function waitForStdout(
  proc: ReturnType<typeof Bun.spawn>,
  needle: string,
  deadlineMs: number,
): Promise<string> {
  const deadline = Date.now() + deadlineMs;
  let buf = "";
  const stdout = proc.stdout;
  if (!(stdout instanceof ReadableStream)) {
    throw new Error("expected piped stdout");
  }
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now());
      const raced = await Promise.race([
        reader.read(),
        new Promise<{ timedOut: true }>((resolve) => setTimeout(() => resolve({ timedOut: true }), remaining)),
      ]);
      if ("timedOut" in raced) break;
      if (raced.value) buf += decoder.decode(raced.value);
      if (buf.includes(needle)) return buf;
      if (raced.done) break;
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(needle)}. Got: ${JSON.stringify(buf)}`);
}

describe("cli subcommands", () => {
  test("unknown command prints usage including client and mcp", async () => {
    const proc = Bun.spawn(["bun", CLI], { stdout: "pipe", stderr: "pipe" });
    procs.push(proc);
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    expect(stderr).toContain("client");
    expect(stderr).toContain("mcp");
    expect(proc.exitCode).toBe(1);
  });

  test("roomyx client with no live rooms exits with a clear error (does not hang)", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-cli-client-"));
    const registryPath = join(dir, "registry.json");
    writeFileSync(registryPath, JSON.stringify({ schemaVersion: 1, rooms: [] }));
    const proc = Bun.spawn(["bun", CLI, "client", "--registry", registryPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    procs.push(proc);
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    expect(stderr).toContain("No live roomyx rooms found");
    expect(proc.exitCode).toBe(1);
  });

  test("roomyx mcp starts a management server reachable via a real MCP round-trip", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-cli-mcp-"));
    const registryPath = join(dir, "registry.json");
    const configPath = join(dir, "config.json");
    writeFileSync(registryPath, JSON.stringify({ schemaVersion: 1, rooms: [] }));
    writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, defaultPort: 4319, roomLogDir: "" }));

    const proc = Bun.spawn(
      ["bun", CLI, "mcp", "--port", "0", "--registry", registryPath, "--config", configPath],
      { stdout: "pipe", stderr: "pipe" },
    );
    procs.push(proc);

    const stdout = await waitForStdout(proc, "roomyx mcp listening at ", 5000);
    const match = stdout.match(/roomyx mcp listening at (\S+)/);
    expect(match).not.toBeNull();
    const url = match![1]!;

    const client = new Client({ name: "roomyx-cli-mcp-test", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    const result = await client.callTool({ name: "roomyx.rooms.list", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(JSON.parse(text)).toEqual([]);
    await client.close();
  }, 10000);
});
