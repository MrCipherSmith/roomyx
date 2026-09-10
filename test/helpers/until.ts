/**
 * Wait for a condition, not for a duration.
 *
 * Shared because there were two of these already — `until()` in
 * `test/client/render.test.ts` and `waitForFrame()` in
 * `test/client-shutdown.test.ts` — and a third would have been the point at
 * which they start disagreeing about the deadline.
 *
 * A fixed sleep in place of a condition is a false pass waiting to happen: the
 * two shutdown cases asserted only negatives after 2s, so a client still on its
 * "connecting…" frame satisfied every one of them. Where the sleep *is* the
 * thing under test — "wait, then assert nothing arrived" — a duration is
 * correct and this helper is the wrong tool.
 */
export async function until(
  predicate: () => boolean | Promise<boolean>,
  what: string,
  { timeoutMs = 10_000, pollMs = 20 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
