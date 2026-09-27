/**
 * A long-lived server's ordered exit, as a unit that can be tested.
 *
 * It lived in `cli.ts`, which no test can import: that module runs its entry
 * point on import and prints usage. The consequence was measured rather than
 * suspected — a post-fix verifier deleted the re-entry guard below and all 265
 * tests stayed green, including the subprocess case written to pin it. From
 * outside the process the two behaviours are identical: without the guard the
 * teardown simply runs three times and the first `exit` wins, so three
 * deregistrations of one room look exactly like one.
 *
 * Two properties, and both were once wrong in one of the three copies of this
 * logic that existed before it was written down once:
 *
 * - **Re-entry.** A second signal arriving mid-teardown must not start another.
 * - **Order.** `cleanup` runs *after* the close resolves. Deregistering first
 *   meant a shutdown that hung — and it hung whenever a client was attached —
 *   removed the room from the registry while the process kept running and kept
 *   the port. The room became invisible while still being served.
 *
 * Two more properties, found by an audit rather than by observed failure —
 * `cleanup` is `deregisterRoom`, which writes a file under a lock and can
 * throw (a lock timeout, a corrupt registry):
 *
 * - **A throwing `cleanup` must not swallow `exit`.** The old code ran both
 *   inside one `.finally()`, so a throw there replaced the `exit()` after it.
 *   The rejection went unhandled, the process did not die, and a SIGTERM left
 *   the server running — the one outcome shutdown may not have. `cleanup` is
 *   now wrapped in its own try/catch that logs and falls through to `exit`
 *   regardless.
 * - **A rejected `close` must not exit 0.** The exit code is the only thing a
 *   supervisor reads; reporting success for a shutdown that could not release
 *   the port sends whatever restarts it straight into `EADDRINUSE` with
 *   nothing in the registry left to explain it. `cleanup` still runs on this
 *   path — the entry is removed the same as a clean shutdown, matching the
 *   `SIGHUP`/`SIGTERM`/`SIGINT` handlers that already treat "told to stop" as
 *   reason enough to deregister, whether or not the port actually let go.
 *   Only the exit code now tells the difference.
 */
export function createServerShutdown(
  close: () => Promise<void>,
  cleanup: () => void = () => undefined,
  exit: (code: number) => void = (code) => process.exit(code),
): () => void {
  let shuttingDown = false;
  return (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    const finish = (code: number): void => {
      try {
        cleanup();
      } catch (error: unknown) {
        console.error(`cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      exit(code);
    };
    void close().then(
      () => finish(0),
      (error: unknown) => {
        console.error(`shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
        finish(1);
      },
    );
  };
}
