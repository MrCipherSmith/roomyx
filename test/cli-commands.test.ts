import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  // Every case here was measured against the published 0.4.0, where the CLI
  // had two hand-rolled argv scanners and no grammar between them.
  describe("the argument grammar, end to end", () => {
    test("`serve --help` prints help instead of starting a server", async () => {
      const proc = Bun.spawn(["bun", CLI, "serve", "--help"], { stdout: "pipe", stderr: "pipe" });
      procs.push(proc);
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      expect(proc.exitCode).toBe(0);
      expect(stdout).toContain("roomyx serve <logPath>");
      expect(stdout).toContain("--port");
      // The 0.4.0 behaviour: it bound a port and minted a room ID.
      expect(stdout).not.toContain("room ID:");
    });

    test("`roomyx --help` exits 0 on stdout, while a bogus command exits 1 on stderr", async () => {
      const help = Bun.spawn(["bun", CLI, "--help"], { stdout: "pipe", stderr: "pipe" });
      procs.push(help);
      const helpOut = await new Response(help.stdout).text();
      await help.exited;
      expect(help.exitCode).toBe(0);
      expect(helpOut).toContain("Usage: roomyx");

      const bogus = Bun.spawn(["bun", CLI, "definitely-not-a-command"], { stdout: "pipe", stderr: "pipe" });
      procs.push(bogus);
      const bogusErr = await new Response(bogus.stderr).text();
      await bogus.exited;
      expect(bogus.exitCode).toBe(1);
      expect(bogusErr).toContain("Usage: roomyx");
    });

    test("options may precede the positional, and the file is not read as a flag", async () => {
      dir = mkdtempSync(join(tmpdir(), "roomyx-argorder-"));
      const log = join(dir, "room.jsonl");
      const registry = join(dir, "registry.json");
      await new Response(
        Bun.spawn(["bun", CLI, "room", "new", log, "--goal", "g"], { stdout: "pipe", stderr: "pipe" }).stdout,
      ).text();

      const proc = Bun.spawn(["bun", CLI, "serve", "--port", "0", "--registry", registry, log], {
        stdout: "pipe",
        stderr: "pipe",
      });
      procs.push(proc);
      const stdout = await waitForStdout(proc, "room ID: ", 5000);
      // 0.4.0 served a file literally named "--port", on the default port.
      expect(stdout).toContain(log);
      expect(stdout).not.toContain("--port");
    }, 10000);

    test("a bad port is refused rather than silently becoming 1 or a random port", async () => {
      const noValue = Bun.spawn(["bun", CLI, "serve", "x.jsonl", "--port"], { stdout: "pipe", stderr: "pipe" });
      procs.push(noValue);
      const noValueErr = await new Response(noValue.stderr).text();
      await noValue.exited;
      expect(noValue.exitCode).toBe(1);
      expect(noValueErr).toContain("--port needs a value");

      const notANumber = Bun.spawn(["bun", CLI, "serve", "x.jsonl", "--port", "abc"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      procs.push(notANumber);
      const notANumberErr = await new Response(notANumber.stderr).text();
      await notANumber.exited;
      expect(notANumber.exitCode).toBe(1);
      expect(notANumberErr).toContain("needs a number");
    });

    test("an unknown flag is refused with a suggestion instead of being ignored", async () => {
      const proc = Bun.spawn(["bun", CLI, "skills", "sync", "--target", "x", "--dryrun"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      procs.push(proc);
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;
      expect(proc.exitCode).toBe(1);
      expect(stderr).toContain("Unknown flag --dryrun");
      expect(stderr).toContain("--dry-run");
    });

    test("`rooms list --registry` reads the registry it was given", async () => {
      dir = mkdtempSync(join(tmpdir(), "roomyx-registry-flag-"));
      const registry = join(dir, "registry.json");
      writeFileSync(
        registry,
        JSON.stringify({
          schemaVersion: 1,
          rooms: [{ id: "r-ghost", port: 1, logPath: "/nope.jsonl", pid: 999999, startedAt: "2026-01-01T00:00:00Z" }],
        }),
      );

      const proc = Bun.spawn(["bun", CLI, "rooms", "list", "--registry", registry], {
        stdout: "pipe",
        stderr: "pipe",
      });
      procs.push(proc);
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      // The entry is dead, so it is pruned and the answer is "none" — but the
      // proof it read *this* file is that the file changed.
      expect(stdout).toContain("No live rooms");
      expect(JSON.parse(readFileSync(registry, "utf8")).rooms).toEqual([]);
    }, 10000);
  });

  test("unknown command prints usage including client and mcp", async () => {
    const proc = Bun.spawn(["bun", CLI], { stdout: "pipe", stderr: "pipe" });
    procs.push(proc);
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    expect(stderr).toContain("client");
    expect(stderr).toContain("mcp");
    expect(proc.exitCode).toBe(1);
  });

  test("--version prints the manifest's version, which the release workflow checks against the tag", async () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    ) as { version: string };
    const proc = Bun.spawn(["bun", CLI, "--version"], { stdout: "pipe", stderr: "pipe" });
    procs.push(proc);
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(stdout.trim()).toBe(manifest.version);
    expect(proc.exitCode).toBe(0);
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

describe("roomyx skills sync", () => {
  // Every one of these points --target at a temp path. D-02: the mechanism is
  // exercised against fixtures, never a real ~/.claude/skills/... file.
  function setupProject(): { configPath: string; target: string } {
    dir = mkdtempSync(join(tmpdir(), "roomyx-cli-skills-"));
    const configPath = join(dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, defaultPort: 4319, roomLogDir: "" }));
    return { configPath, target: join(dir, "nested", "SKILL.md") };
  }

  async function runSync(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const proc = Bun.spawn(["bun", CLI, "skills", "sync", ...args], { stdout: "pipe", stderr: "pipe" });
    procs.push(proc);
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    return { stdout, stderr, code: proc.exitCode };
  }

  test("without --yes it reports what it would do and writes nothing", async () => {
    const { configPath, target } = setupProject();
    const { stdout, code } = await runSync(["--target", target, "--config", configPath]);
    expect(code).toBe(0);
    expect(stdout).toContain("would write");
    expect(existsSync(target)).toBe(false);
  });

  test("with --yes it writes the bundled skill, creating the directory it needs", async () => {
    const { configPath, target } = setupProject();
    const { stdout, code } = await runSync(["--target", target, "--config", configPath, "--yes"]);
    expect(code).toBe(0);
    expect(stdout).toContain("written");
    expect(readFileSync(target, "utf8")).toContain("startup-room");
  });

  test("a backup is made when the target has changed, and not when it has not", async () => {
    // This used to assert a backup on a second identical `--yes` run. That was
    // asserting the churn: the file was rewritten with the same bytes and
    // another timestamped copy appeared beside it, every time. A backup exists
    // to undo the change that was just made, so it belongs to a change.
    const { configPath, target } = setupProject();
    await runSync(["--target", target, "--config", configPath, "--yes"]);

    const unchanged = await runSync(["--target", target, "--config", configPath, "--yes"]);
    expect(unchanged.stdout).toContain("already in sync");
    expect(unchanged.stdout).not.toContain("backup:");

    writeFileSync(target, "someone edited this");
    const changed = await runSync(["--target", target, "--config", configPath, "--yes"]);
    expect(changed.stdout).toContain("backup:");
    // One backup, at a fixed name — the version that was displaced.
    expect(readFileSync(`${target}.bak`, "utf8")).toBe("someone edited this");
  });

  test("refuses to overwrite content roomyx never wrote, even with --yes absent from the picture", async () => {
    const { configPath } = setupProject();
    const handWritten = join(dir!, "hand-written.md");
    writeFileSync(handWritten, "someone's own skill");
    const { stdout } = await runSync(["--target", handWritten, "--config", configPath]);
    expect(stdout).toContain("never synced it before");
    expect(readFileSync(handWritten, "utf8")).toBe("someone's own skill");
  });

  test("missing --target is an error, not a default", async () => {
    const { stderr, code } = await runSync([]);
    expect(stderr).toContain("Missing --target");
    expect(code).toBe(1);
  });

  test("an un-initialized project is told to run init rather than shown a stack trace", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-cli-skills-noinit-"));
    const { stderr, code } = await runSync([
      "--target",
      join(dir, "SKILL.md"),
      "--config",
      join(dir, "config.json"),
    ]);
    expect(stderr).toContain("roomyx init");
    expect(code).toBe(1);
  });
});
