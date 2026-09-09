import { describe, expect, test } from "bun:test";
import { createShutdown } from "../../src/client/shutdown";

/**
 * The barrier the subprocess test could not be.
 *
 * `test/client-shutdown.test.ts` spawns a real client, signals it, and asserts
 * no stack trace appears. That catches a missing signal handler and nothing
 * else: inverting the teardown order, and separately deleting the three
 * `stopped` guards in `mcp-client.ts`, both left it green. The window the
 * ordering protects is a poll that is in flight at the instant teardown starts,
 * and a subprocess test at second granularity cannot aim at it.
 *
 * So the ordering is a unit now, and this asserts the order directly.
 */

describe("the client's ordered shutdown", () => {
  test("polling stops before the renderer is destroyed", async () => {
    // The whole fix. The other way round, an in-flight poll loses its
    // connection during teardown and writes into a destroyed text buffer.
    const order: string[] = [];
    const shutdown = createShutdown({
      stopClient: async () => {
        await Promise.resolve();
        order.push("stopClient");
      },
      destroyRenderer: () => order.push("destroyRenderer"),
      exit: () => order.push("exit"),
    });

    shutdown(0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual(["stopClient", "destroyRenderer", "exit"]);
  });

  test("the renderer is destroyed even when stopping the client rejects", async () => {
    // A failed stop must not leave the terminal in the alternate screen with
    // mouse tracking on, which is what an unhandled rejection here would do.
    const order: string[] = [];
    const shutdown = createShutdown({
      stopClient: () => Promise.reject(new Error("poll in flight")),
      destroyRenderer: () => order.push("destroyRenderer"),
      exit: (code) => order.push(`exit:${code}`),
    });

    shutdown(3);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual(["destroyRenderer", "exit:3"]);
  });

  test("a second signal during teardown does not start a second teardown", async () => {
    let stops = 0;
    let destroys = 0;
    let exits = 0;
    const shutdown = createShutdown({
      stopClient: async () => {
        stops += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
      destroyRenderer: () => {
        destroys += 1;
      },
      exit: () => {
        exits += 1;
      },
    });

    shutdown(0);
    shutdown(0);
    shutdown(0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect([stops, destroys, exits]).toEqual([1, 1, 1]);
  });

  test("the exit code is carried through", async () => {
    const codes: number[] = [];
    const shutdown = createShutdown({
      stopClient: () => Promise.resolve(),
      destroyRenderer: () => undefined,
      exit: (code) => codes.push(code),
    });
    shutdown(7);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(codes).toEqual([7]);
  });
});
