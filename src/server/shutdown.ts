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
    void close()
      .catch((error: unknown) => {
        console.error(`shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        cleanup();
        exit(0);
      });
  };
}
