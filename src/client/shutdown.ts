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
    void steps
      .stopClient()
      .catch(() => undefined)
      .finally(() => {
        steps.destroyRenderer();
        steps.exit(code);
      });
  };
}
