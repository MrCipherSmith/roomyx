import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/**
 * A project and a fake home.
 *
 * The fake home is not tidiness — `roomyx init --yes` applies the default
 * selection, and the default selection includes every runtime installed on the
 * machine. Run against the real `$HOME` this test would write into the
 * operator's own `~/.claude/skills/`. `homedir()` follows `$HOME` on Linux, so
 * overriding it in the child's environment is enough to keep the whole run
 * inside the temp directory.
 */
function project(): { root: string; home: string; env: Record<string, string> } {
  dir = mkdtempSync(join(tmpdir(), "roomyx-cli-init-"));
  const root = join(dir, "proj");
  const home = join(dir, "home");
  mkdirSync(root, { recursive: true });
  mkdirSync(home, { recursive: true });
  return { root, home, env: { ...(process.env as Record<string, string>), HOME: home } };
}

describe("roomyx init", () => {
  test("through a pipe it scaffolds and asks nothing — it can never hang waiting for a keypress", () => {
    // The property that matters in CI and in any `roomyx init | tee` : a prompt
    // nobody is there to answer is a hang, and a hang in an installer is worse
    // than doing nothing.
    const { root, env } = project();
    const result = Bun.spawnSync(["bun", CLI, "init"], { cwd: root, env });

    expect(result.exitCode).toBe(0);
    const out = result.stdout.toString();
    expect(out).toContain("Nothing else was written");
    expect(out).toContain("roomyx init --yes");

    // Scaffolded, and nothing beyond it.
    expect(existsSync(join(root, ".roomyx", "config.json"))).toBe(true);
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  }, 20000);

  test("--yes applies the default selection and says where every file went", () => {
    const { root, home, env } = project();
    // Claude "installed" for this fake machine, Cursor not.
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(root, ".git"), { recursive: true });

    const result = Bun.spawnSync(["bun", CLI, "init", "--yes"], { cwd: root, env });
    expect(result.exitCode).toBe(0);
    const out = result.stdout.toString();

    // The user-scoped Claude skill: ticked because ~/.claude exists here.
    expect(existsSync(join(home, ".claude", "skills", "startup-room", "SKILL.md"))).toBe(true);
    // Cursor was not installed, so nothing was written for it — the rule that a
    // default tick must never surprise you with a file.
    expect(existsSync(join(home, ".cursor"))).toBe(false);

    // The log directory the config has always named and nothing ever created.
    expect(existsSync(join(root, ".roomyx", "rooms", "logs"))).toBe(true);

    // A git repository, so the machine-local state is ignored — and the logs
    // deliberately are not.
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    expect(ignore).toContain(".roomyx/rooms/registry.json");
    expect(ignore).not.toContain(".roomyx/rooms/logs");

    // Every write is named in the summary, and the thing operators forget is
    // said out loud.
    expect(out).toContain(join(home, ".claude", "skills", "startup-room", "SKILL.md"));
    expect(out).toContain("Restart your agent");
  }, 20000);

  test("--no-interactive scaffolds only, even on a terminal", () => {
    const { root, home, env } = project();
    mkdirSync(join(home, ".claude"), { recursive: true });

    const result = Bun.spawnSync(["bun", CLI, "init", "--no-interactive"], { cwd: root, env });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, ".roomyx", "config.json"))).toBe(true);
    expect(existsSync(join(home, ".claude", "skills", "startup-room", "SKILL.md"))).toBe(false);
  }, 20000);

  test("run twice, it changes nothing the second time", () => {
    // `init` is the command people run when they are not sure whether they ran
    // it. D-01 says it never clobbers; this asserts it against the whole new
    // surface, not just the three files the original scaffold wrote.
    const { root, home, env } = project();
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(root, ".git"), { recursive: true });

    Bun.spawnSync(["bun", CLI, "init", "--yes"], { cwd: root, env });
    const first = readFileSync(join(root, ".gitignore"), "utf8");
    const mcpFirst = existsSync(join(root, ".mcp.json"))
      ? readFileSync(join(root, ".mcp.json"), "utf8")
      : null;

    Bun.spawnSync(["bun", CLI, "init", "--yes"], { cwd: root, env });
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe(first);
    if (mcpFirst !== null) expect(readFileSync(join(root, ".mcp.json"), "utf8")).toBe(mcpFirst);
  }, 30000);
});

describe("roomyx mcp --stdio", () => {
  test("answers initialize over the pipe, and writes nothing else to stdout", async () => {
    // stdout is the protocol channel here. One stray line of greeting — the
    // kind the HTTP branch prints two of — is a parse error at the far end, and
    // the failure surfaces to the operator as an MCP server that will not
    // connect for no visible reason.
    const { root, env } = project();
    const proc = Bun.spawn(["bun", CLI, "mcp", "--stdio"], {
      cwd: root,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
      })}\n`,
    );
    proc.stdin.flush();

    const reader = proc.stdout.getReader();
    const deadline = Date.now() + 15000;
    let buffer = "";
    interface InitializeReply {
      result?: { serverInfo?: { name?: string } };
    }
    let response: InitializeReply | null = null;
    while (Date.now() < deadline && response === null) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      for (const line of buffer.split("\n")) {
        if (line.trim() === "") continue;
        // Every line on stdout must be JSON-RPC. A non-JSON line is the defect.
        response = JSON.parse(line) as InitializeReply;
      }
    }

    proc.kill();
    expect(response?.result?.serverInfo?.name).toBe("roomyx-management");
  }, 25000);
});
