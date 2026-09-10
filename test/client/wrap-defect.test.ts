import { expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { ChatView } from "../../src/client/screens/chat-view";

/**
 * A tripwire for a defect roomyx does not own.
 *
 * A word that ends exactly at the wrap column loses its last character. It is
 * not wrapped to the next line and not replaced by an ellipsis — it is gone.
 * Found in a real terminal at 72 columns, where the source text
 * `Continuing the thread on whether` drew as `Continuing the thread o whether`,
 * then reproduced headlessly at several widths.
 *
 * It is written with `test.failing` on purpose: the assertion below is what
 * *should* be true, so this file passes while the defect exists and starts
 * failing the day it is fixed. That is the point — a silently-fixed upstream
 * bug would otherwise leave a workaround in place forever.
 *
 * **No workaround is applied.** The obvious one — a one-column right margin on
 * the body — was measured: it makes the text reconstruct at 60, 72, 108 and
 * 120 columns and still lose a character at 90. It moves the boundary rather
 * than removing the cause, which would turn a reproducible defect into an
 * intermittent one and make it harder to find later. Better to leave it
 * visible and reported.
 *
 * Two other hypotheses were measured and are wrong: the vertical scrollbar is
 * not eating the column (the loss happens with three messages and no scrollbar
 * exactly as with sixteen), and it is not simply narrow terminals (120 columns
 * is clean while 90 is not).
 *
 * **It is not synthetic.** `scripts/replay.ts` plays a real recorded room —
 * `docs/roomyx/screenshots/review-room.jsonl`, nine messages from an actual
 * review — through the real view and sweeps every frame. At width 80, the most
 * ordinary terminal width there is, the word `continuation` never appears
 * whole: only `continuatio`. At 60, 100 and 140 it is intact. So a reader on a
 * default terminal loses characters out of real sentences, which is a stronger
 * statement than the constructed case below and was worth finding.
 */
const BODY =
  "Mira's right and I'll take the correction. The footer isn't the thing that entrenches the keymap — " +
  "the missing scrollback is — but a printed keymap does become the contract people quote back at you, " +
  "and I'd rather not spend goodwill teaching arrows-move-the-roster and then take it away. " +
  "Ship it second, in the same afternoon, describing the corrected map.";

async function rendersIntact(width: number): Promise<boolean> {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width, height: 40 });
  const chat = new ChatView(renderer, { width, height: 40 });
  renderer.root.add(chat.node);
  chat.setRoster([{ id: "p", name: "Paul" }]);
  chat.appendMessages([{ seq: 1, from: "p", body: BODY }]);
  await renderOnce();
  // Wrapping removed one space at each break, so rejoining with single spaces
  // is what an intact body reconstructs to.
  const shown = captureCharFrame()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  renderer.destroy();
  return shown.includes(BODY);
}

test.failing("a wrapped message body reaches the screen with every character it was given", async () => {
  for (const width of [72, 90, 108]) {
    expect(await rendersIntact(width)).toBe(true);
  }
});

test("the defect is width-dependent, not universal — a wide pane is intact", async () => {
  // Kept as an ordinary passing test so the tripwire above cannot be dismissed
  // as "wrapping is just broken everywhere".
  expect(await rendersIntact(120)).toBe(true);
});
