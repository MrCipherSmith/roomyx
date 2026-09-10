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
});
