import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The `bin` entries are Node launchers rather than the TypeScript itself,
 * because a `#!/usr/bin/env bun` shebang cannot say anything when Bun is
 * absent — the kernel resolves it and reports `env: 'bun': No such file or
 * directory` with no roomyx text in it at all.
 *
 * These run the launchers as installed users would, through Node.
 */

const LAUNCHER = join(import.meta.dir, "..", "src", "bin", "roomyx.mjs");
const CLIENT_LAUNCHER = join(import.meta.dir, "..", "src", "bin", "roomyx-client.mjs");

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

async function run(script: string, args: string[], env?: Record<string, string>) {
  const proc = Bun.spawn(["node", script, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    ...(env ? { env } : {}),
  });
  procs.push(proc);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr, code: proc.exitCode };
}

/** A PATH carrying node but deliberately not bun. */
function pathWithoutBun(): string {
  dir = mkdtempSync(join(tmpdir(), "roomyx-nobun-"));
  symlinkSync(process.execPath, join(dir, "node"));
  return `${dir}:/usr/bin:/bin`;
}

describe("the bin launchers", () => {
  test("pass arguments through and report the child's exit code", async () => {
    const version = await run(LAUNCHER, ["--version"]);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);

    const unknown = await run(LAUNCHER, ["definitely-not-a-command"]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("Usage: roomyx");
  });

  test("without Bun on PATH, roomyx says so in its own words and exits 1", async () => {
    const { stdout, stderr, code } = await run(LAUNCHER, ["--version"], {
      PATH: pathWithoutBun(),
      HOME: process.env.HOME ?? "",
    });

    expect(code).toBe(1);
    expect(stderr).toContain("roomyx needs Bun");
    expect(stderr).toContain("https://bun.sh");
    // The failure it replaces produced no roomyx output at all.
    expect(stderr).not.toContain("No such file or directory");
    expect(stdout).toBe("");
  });

  test("the hint never offers to install Bun — an install-time fetch is what installer D-01 refuses", async () => {
    const { stderr } = await run(LAUNCHER, ["--version"], {
      PATH: pathWithoutBun(),
      HOME: process.env.HOME ?? "",
    });
    // It prints the command for a human to run; it must not run one itself.
    expect(stderr).toContain("Install:");
    expect(stderr).not.toMatch(/downloading|installing bun|fetching/i);
  });

  // PKG-4(b). `cli.ts`'s `client` subcommand does `await import("./client/index")`,
  // and that module only calls runClient() when `import.meta.main` is true. A
  // launcher pointed at the wrong entry, or one that re-execs, runs the client
  // twice. The observable is the message it prints when no room is live.
  test("`roomyx client` reaches the client exactly once", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-once-"));
    const registry = join(dir, "registry.json");

    const { stderr } = await run(LAUNCHER, ["client", "--registry", registry]);
    const occurrences = stderr.split("No live roomyx rooms found").length - 1;
    expect(occurrences).toBe(1);
  });

  test("the dedicated client binary reaches it exactly once too, by its own entry", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-once-"));
    const registry = join(dir, "registry.json");

    const { stderr } = await run(CLIENT_LAUNCHER, ["--registry", registry]);
    const occurrences = stderr.split("No live roomyx rooms found").length - 1;
    expect(occurrences).toBe(1);
  });

  test("both launchers are Node scripts, so npm's Windows shim has something to wrap", async () => {
    const { readFileSync } = await import("node:fs");
    for (const launcher of [LAUNCHER, CLIENT_LAUNCHER]) {
      expect(readFileSync(launcher, "utf8").split("\n")[0]).toBe("#!/usr/bin/env node");
    }
    // And they live under `src/`, which is what `files` ships.
    expect(dirname(dirname(LAUNCHER)).endsWith("src")).toBe(true);
  });
});
