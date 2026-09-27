/**
 * The client's ordered exit, as a unit that can be tested.
 *
 * It used to live inside `runClient`, which no test reaches — that file builds
 * a renderer on import, so it cannot run without a real terminal. The
 * consequence was measured rather than suspected: inverting the order below,
 * and separately deleting the `stopped` guards in `mcp-client.ts`, both left
 * `test/client-shutdown.test.ts` green. The file written to protect the fix did
 * not fail when the fix was removed.
 *
 * **The order is the fix.** Stop polling before tearing the renderer down. The
 * other way round, an in-flight poll loses its connection during teardown,
 * calls `handleDisconnect`, and writes "disconnected" into a text buffer the
 * renderer has already destroyed — `TextBuffer is destroyed`, ten frames of
 * stack, at someone who just closed a window.
 *
 * Idempotence is the other half: a second signal arriving mid-teardown must not
 * start a second one.
 *
 * Two more properties, matching the server's `createServerShutdown`:
 *
 * - **A throwing `destroyRenderer` must not swallow `exit`.** It used to run
 *   inside the same `.finally()` as `exit`, so a throw there replaced the
 *   `exit()` call — and @opentui's `destroy()` is exactly the call that throws
 *   when the renderer is already half torn down. The result was a TUI that was
 *   asked to quit and did not: the terminal stuck in the alternate screen with
 *   mouse tracking on. `destroyRenderer` now runs in its own try/catch that
 *   logs and falls through to `exit` regardless.
 * - **A rejected `stopClient` must not report the clean exit code it was
 *   asked for.** The exit code is what a supervising dispatcher reads. A
 *   client that could not stop its poller — the MCP session still open, the
 *   room still has an attached reader — exiting 0 tells that dispatcher the
 *   session closed cleanly when it did not. When `stopClient` rejects and the
 *   caller asked for `0`, the process exits `1` instead; a non-zero code the
 *   caller asked for is passed through unchanged, since it already reports
 *   failure.
 */
export interface ShutdownSteps {
  stopClient: () => Promise<void>;
  destroyRenderer: () => void;
  exit: (code: number) => void;
}

export function createShutdown(steps: ShutdownSteps): (code: number) => void {
  let shuttingDown = false;
  return (code: number): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    const finish = (finalCode: number): void => {
      try {
        steps.destroyRenderer();
      } catch (error: unknown) {
        console.error(`renderer teardown failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      steps.exit(finalCode);
    };
    void steps.stopClient().then(
      () => finish(code),
      () => finish(code === 0 ? 1 : code),
    );
  };
}
