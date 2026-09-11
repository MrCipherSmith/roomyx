import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireWriterLease, LEASE_STALE_MS, writerLeasePathFor } from "../src/writer-lease";

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

async function run(args: string[], cwd?: string, options: { stdin?: string } = {}) {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    ...(cwd ? { cwd } : {}),
    ...(options.stdin === undefined ? {} : { stdin: new TextEncoder().encode(options.stdin) }),
  });
  procs.push(proc);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr, code: proc.exitCode };
}

describe("roomyx room new", () => {
  test("creates a log whose first line is the state record, with the goal and roster", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-new-"));
    const log = join(dir, "room.jsonl");

    const { code } = await run(["room", "new", log, "--goal", "Pick a database", "--roster", "yuki:Юки,omar:Omar"]);
    expect(code).toBe(0);

    const first = JSON.parse(readFileSync(log, "utf8").split("\n")[0] as string);
    expect(first.type).toBe("state");
    expect(first.goal_contract.goal_statement).toBe("Pick a database");
    expect(first.roster).toEqual([
      { id: "yuki", name: "Юки" },
      { id: "omar", name: "Omar" },
    ]);
  });

  test("refuses to overwrite an existing log — a room log is append-only", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-new-"));
    const log = join(dir, "room.jsonl");
    await run(["room", "new", log, "--goal", "First"]);

    const { stderr, code } = await run(["room", "new", log, "--goal", "Second"]);
    expect(code).toBe(1);
    expect(stderr).toContain("already exists");
    // The original survived.
    expect(readFileSync(log, "utf8")).toContain("First");
  });

  test("a room without a goal is refused rather than defaulted", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-new-"));
    const { stderr, code } = await run(["room", "new", join(dir, "r.jsonl")]);
    expect(code).toBe(1);
    expect(stderr).toContain("--goal");
    expect(existsSync(join(dir, "r.jsonl"))).toBe(false);
  });
});

describe("roomyx room append", () => {
  test("numbers messages from the log rather than from a counter it keeps", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-append-"));
    const log = join(dir, "room.jsonl");
    await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);

    await run(["room", "append", log, "--from", "a", "--body", "first"]);
    await run(["room", "append", log, "--from", "a", "--body", "second", "--kind", "challenge", "--in-reply-to", "1"]);

    const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
    const messages = lines.slice(1).map((l) => JSON.parse(l));
    expect(messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(messages[1].kind).toBe("challenge");
    expect(messages[1].in_reply_to).toBe(1);
  });

  test("refuses a log that does not exist, and says how to make one", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-room-append-"));
    const { stderr, code } = await run([
      "room",
      "append",
      join(dir, "nope.jsonl"),
      "--from",
      "a",
      "--body",
      "x",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("roomyx room new");
  });

  // D-01a, as amended by D-18. The guard exists to stop a SECOND writer in a
  // live room — and a live room with no dispatcher has no first writer, so the
  // old refusal was making a false claim about it and `--force` was the escape
  // from the falsehood. These four cases are the whole table.
  describe("writer ownership", () => {
    async function startRoom(log: string, registryPath: string): Promise<string> {
      const server = Bun.spawn(["bun", CLI, "serve", log, "--port", "0", "--registry", registryPath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      procs.push(server);
      const deadline = Date.now() + 5000;
      let roomId = "";
      while (Date.now() < deadline && !roomId) {
        try {
          const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as { rooms: { id: string }[] };
          if (parsed.rooms.length > 0) roomId = parsed.rooms[0]!.id;
        } catch {
          // not written yet
        }
        if (!roomId) await new Promise((r) => setTimeout(r, 50));
      }
      expect(roomId).not.toBe("");
      return roomId;
    }

    test("a bare serve has no writer to race: append writes, with no flag at all", async () => {
      dir = mkdtempSync(join(tmpdir(), "roomyx-owner-bare-"));
      const log = join(dir, "room.jsonl");
      const registryPath = join(dir, "registry.json");
      await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);
      await startRoom(log, registryPath);

      const before = readFileSync(log, "utf8");
      const appended = await run(["room", "append", log, "--from", "a", "--body", "written by hand", "--registry", registryPath]);
      expect(appended.code).toBe(0);
      expect(readFileSync(log, "utf8")).not.toBe(before);

      // This used to assert `stderr === ""`, which was a proxy for "it did not
      // refuse" — and the proxy became wrong the moment `append` started noting
      // that a room is serving the log. The note is expected here; a refusal is
      // not, and that is what this test is actually about. Asserting the
      // absence of the refusal says so directly and cannot be broken by adding
      // another line of context.
      expect(appended.stderr).not.toContain("A writer is live");
      expect(appended.stderr).not.toContain("--take-over");
      expect(appended.stderr).toContain("is serving");
    }, 20000);

    test("--force is gone", async () => {
      dir = mkdtempSync(join(tmpdir(), "roomyx-owner-noflag-"));
      const log = join(dir, "room.jsonl");
      await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);

      const forced = await run(["room", "append", log, "--from", "a", "--body", "x", "--force"]);
      expect(forced.code).toBe(1);
      expect(forced.stderr).toContain("--force");
      // A flag that still worked while the tests stopped looking would be worse
      // than one that was never removed, so the write itself is checked too.
      expect(readFileSync(log, "utf8").split("\n").filter(Boolean)).toHaveLength(1);
    });

    test("a fresh lease from another writer: append refuses, and --take-over refuses too", async () => {
      dir = mkdtempSync(join(tmpdir(), "roomyx-owner-live-"));
      const log = join(dir, "room.jsonl");
      const registryPath = join(dir, "registry.json");
      await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);
      const roomId = await startRoom(log, registryPath);

      // Pid 1 is not this machine's writer; what matters is that the lease is
      // fresh, which is the only thing that can be checked without trusting it.
      acquireWriterLease(writerLeasePathFor(registryPath, log), { pid: 1 });
      const before = readFileSync(log, "utf8");

      const refused = await run(["room", "append", log, "--from", "a", "--body", "x", "--registry", registryPath]);
      expect(refused.code).toBe(1);
      expect(refused.stderr).toContain(roomId);
      // Names the writer, so the operator can act on it...
      expect(refused.stderr).toContain("pid 1");
      // ...and deliberately does not offer a way past it: a live writer is not
      // something `--take-over` may displace, and a refusal that names a flag
      // which would also be refused is worse than one that names nothing.
      expect(refused.stderr).not.toContain("--take-over");

      const taken = await run(["room", "append", log, "--from", "a", "--body", "x", "--registry", registryPath, "--take-over"]);
      expect(taken.code).toBe(1);
      expect(readFileSync(log, "utf8")).toBe(before);
    }, 20000);

    test("concurrent appends against a fresh lease: none of them land", async () => {
      dir = mkdtempSync(join(tmpdir(), "roomyx-owner-race-"));
      const log = join(dir, "room.jsonl");
      const registryPath = join(dir, "registry.json");
      await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);
      await startRoom(log, registryPath);
      acquireWriterLease(writerLeasePathFor(registryPath, log), { pid: 1 });
      const before = readFileSync(log, "utf8");

      const results = await Promise.all(
        Array.from({ length: 4 }, (_, i) =>
          run(["room", "append", log, "--from", "a", "--body", `x${i}`, "--registry", registryPath]),
        ),
      );
      expect(results.every((r) => r.code === 1)).toBe(true);
      expect(readFileSync(log, "utf8")).toBe(before);
    }, 25000);

    test("a stale lease can be taken over, and the log records that it was", async () => {
      dir = mkdtempSync(join(tmpdir(), "roomyx-owner-stale-"));
      const log = join(dir, "room.jsonl");
      const registryPath = join(dir, "registry.json");
      await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);
      await startRoom(log, registryPath);

      // Written with a timestamp far enough in the past to be past the ceiling.
      acquireWriterLease(writerLeasePathFor(registryPath, log), { pid: 1, now: Date.now() - LEASE_STALE_MS * 3 });

      const taken = await run(["room", "append", log, "--from", "a", "--body", "taken over", "--registry", registryPath, "--take-over"]);
      expect(taken.stderr).toBe("");
      expect(taken.code).toBe(0);

      const lines = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const bodies = lines.slice(1).map((m) => m.body as string);
      expect(bodies).toContain("taken over");
      // The trace is what a reader of the log later needs: a room that was
      // written by hand while its writer was gone must not look supervised.
      const trace = lines.find((m) => typeof m.body === "string" && m.body.includes("--take-over"));
      expect(trace).toBeDefined();
      // The trace and the message it describes are one batch: consecutive seq,
      // so a trace that failed to write would have taken the message with it
      // rather than leaving an unrecorded take-over behind.
      expect(trace?.seq).toBe(lines[lines.length - 1]?.seq);
      const taken2 = lines.find((m) => m.body === "taken over");
      expect(taken2?.seq).toBe((trace?.seq as number) - 1);
    }, 20000);
  });

  test("a body survives the shell it was passed through", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-append-json-"));
    const log = join(dir, "room.jsonl");
    await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);

    // A quote and a newline are ordinary in a room's prose, and both used to be
    // the caller's problem: the JSON was assembled by hand around whatever the
    // shell delivered.
    const body = 'He said "no".\nThen he said yes — twice.';
    const envelope = JSON.stringify({ from: "a", body, kind: "challenge" });
    const written = await run(["room", "append", log, "--json", envelope]);
    expect(written.stderr).toBe("");
    expect(written.code).toBe(0);

    const readBack = JSON.parse(readFileSync(log, "utf8").split("\n").filter(Boolean)[1] as string);
    expect(readBack.body).toBe(body);
    expect(readBack.kind).toBe("challenge");

    const fromStdin = await run(["room", "append", log, "--body-file", "-", "--from", "b"], undefined, {
      stdin: 'line one\nline "two"',
    });
    expect(fromStdin.stderr).toBe("");
    expect(fromStdin.code).toBe(0);
    const second = JSON.parse(readFileSync(log, "utf8").split("\n").filter(Boolean)[2] as string);
    expect(second.body).toBe('line one\nline "two"');
  }, 20000);

  test("an edit is appended through --json and folds into the state (D-20)", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-append-edit-"));
    const log = join(dir, "room.jsonl");
    await run(["room", "new", log, "--goal", "Pick a database", "--roster", "a:A"]);

    const envelope = JSON.stringify({
      from: "owner",
      kind: "goal_edit",
      body: "raise the pass mark to 85",
      change: {
        type: "goal_contract",
        goal_contract: {
          version: 1,
          goal_statement: "Pick a database",
          criteria: "AC1-AC3",
          threshold: { fail_below: 60, pass_at_or_above: 85 },
        },
      },
    });
    const written = await run(["room", "append", log, "--json", envelope]);
    expect(written.stderr).toBe("");
    expect(written.code).toBe(0);

    // The fold is what makes the edit take effect: the header still says 80, and
    // what the room reads as says 85.
    const { loadRoomLog } = await import("../src/log/store");
    const { state } = loadRoomLog(log);
    expect(state.goal_contract.threshold.pass_at_or_above).toBe(85);
    expect(state.goal_contract.updated_by).toBe("owner");
    const header = JSON.parse(readFileSync(log, "utf8").split("\n")[0] as string);
    expect(header.goal_contract.threshold.pass_at_or_above).toBe(80);
  }, 20000);

  test("a change that does not match its kind is refused, and nothing is written", async () => {
    // The rule lives in the log's schema, so the CLI does not restate it — it
    // just fails to write, which is the outcome that matters.
    dir = mkdtempSync(join(tmpdir(), "roomyx-append-badchange-"));
    const log = join(dir, "room.jsonl");
    await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);
    const before = readFileSync(log, "utf8");

    const envelope = JSON.stringify({
      from: "owner",
      kind: "goal_edit",
      body: "mismatched",
      change: { type: "roster", add: [{ id: "b", name: "B" }] },
    });
    const refused = await run(["room", "append", log, "--json", envelope]);
    expect(refused.code).toBe(1);
    expect(readFileSync(log, "utf8")).toBe(before);
  }, 20000);

  test("--many writes a batch with consecutive seq, and an invalid line writes nothing", async () => {
    dir = mkdtempSync(join(tmpdir(), "roomyx-append-many-"));
    const log = join(dir, "room.jsonl");
    await run(["room", "new", log, "--goal", "g", "--roster", "a:A"]);

    const batch = [
      JSON.stringify({ from: "a", body: "first" }),
      JSON.stringify({ from: "b", body: "second", in_reply_to: 1 }),
      JSON.stringify({ from: "a", body: "third" }),
    ].join("\n");
    const written = await run(["room", "append", log, "--many"], undefined, { stdin: batch });
    expect(written.stderr).toBe("");
    expect(written.code).toBe(0);
    const messages = readFileSync(log, "utf8").split("\n").filter(Boolean).slice(1).map((l) => JSON.parse(l));
    expect(messages.map((m) => m.seq)).toEqual([1, 2, 3]);

    // One bad line means the whole batch is refused: half a batch is a room
    // whose transcript silently skips a turn.
    const before = readFileSync(log, "utf8");
    const bad = [JSON.stringify({ from: "a", body: "fine" }), JSON.stringify({ from: "a", body: "broken", kind: "not-a-kind" })].join("\n");
    const refused = await run(["room", "append", log, "--many"], undefined, { stdin: bad });
    expect(refused.code).toBe(1);
    expect(readFileSync(log, "utf8")).toBe(before);
  }, 20000);
});
