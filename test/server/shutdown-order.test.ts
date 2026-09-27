import { describe, expect, test } from "bun:test";
import { createServerShutdown } from "../../src/server/shutdown";

/**
 * The barrier the subprocess test could not be, and I said it was.
 *
 * A post-fix verifier deleted `if (shuttingDown) return;` from `runUntilSignal`
 * and every one of 265 tests stayed green — including the case in
 * `test/server/transport-gates.test.ts` that was added to pin it. The reason is
 * plain in hindsight: without the guard the teardown simply runs three times,
 * and the first `process.exit(0)` wins, so from outside the process the
 * observable behaviour is identical. Three deregistrations of the same room look
 * exactly like one.
 *
 * Same answer as the client's `createShutdown`: make it a unit and assert the
 * count directly. The subprocess test stays, because it holds a different
 * property — that the signals are wired at all.
 */
describe("the server's shutdown", () => {
  test("a second signal during teardown does not start a second teardown", async () => {
    let closes = 0;
    let cleanups = 0;
    let exits = 0;
    const shutdown = createServerShutdown(
      async () => {
        closes += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
      },
      () => {
        cleanups += 1;
      },
      () => {
        exits += 1;
      },
    );

    shutdown();
    shutdown();
    shutdown();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect([closes, cleanups, exits]).toEqual([1, 1, 1]);
  });

  test("cleanup runs after the close resolves, not before", async () => {
    // Deregistering first meant a hung shutdown removed the room from the
    // registry while the process kept running and kept the port — invisible and
    // still served.
    const order: string[] = [];
    const shutdown = createServerShutdown(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("close");
      },
      () => order.push("cleanup"),
      () => order.push("exit"),
    );
    shutdown();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(order).toEqual(["close", "cleanup", "exit"]);
  });

  test("a close that rejects still deregisters and still exits", async () => {
    const order: string[] = [];
    const shutdown = createServerShutdown(
      () => Promise.reject(new Error("port stuck")),
      () => order.push("cleanup"),
      () => order.push("exit"),
    );
    shutdown();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(order).toEqual(["cleanup", "exit"]);
  });

  test("a cleanup that throws still reaches exit", async () => {
    // `cleanup` is `deregisterRoom`, which writes a file under a lock: it throws
    // on a read-only directory, a full disk, or a lock it could not take. Because
    // it runs *inside* `.finally()`, its throw replaces the `exit()` that follows
    // it — and the rejection is unhandled, so the process does not die, it keeps
    // the port and keeps serving a room that has just been told to stop. A
    // SIGTERM that leaves the server running is the one outcome shutdown may not
    // have.
    let exited: number | undefined;
    const shutdown = createServerShutdown(
      () => Promise.resolve(),
      () => {
        throw new Error("registry is read-only");
      },
      (code) => {
        exited = code;
      },
    );
    shutdown();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(exited).toBeDefined();
  });

  test("a close that rejects exits non-zero", async () => {
    // The exit code is the only thing a supervisor reads. `exit(0)` after a close
    // that rejected reports a clean stop for a server that could not release its
    // port, so whatever restarts it sees success and then an EADDRINUSE it has no
    // reason to connect to the previous instance.
    const codes: number[] = [];
    const shutdown = createServerShutdown(
      () => Promise.reject(new Error("port stuck")),
      () => undefined,
      (code) => codes.push(code),
    );
    shutdown();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(codes).toHaveLength(1);
    expect(codes[0]).not.toBe(0);
  });
});
