import { createCliRenderer } from "@opentui/core";
import { InitPicker } from "./screens/init-picker";
import { resolveAction } from "./keymap";
import type { PlanItem } from "../installer/init-plan";

/**
 * Runs the `roomyx init` picker and resolves with the operator's choices, or
 * with null if they cancelled.
 *
 * Kept apart from `src/cli.ts` and imported lazily there, so `roomyx --version`
 * and every non-interactive path still cost nothing to load — the TUI renderer
 * is the heaviest import in the package.
 */
export async function runInitPicker(items: PlanItem[]): Promise<PlanItem[] | null> {
  const renderer = await createCliRenderer({ targetFps: 30 });
  const picker = new InitPicker(renderer, items, {
    width: renderer.terminalWidth,
    height: renderer.terminalHeight,
  });
  renderer.root.add(picker.node);

  return new Promise<PlanItem[] | null>((resolve) => {
    let settled = false;
    const finish = (value: PlanItem[] | null): void => {
      // Guarded: a keypress arriving between `destroy()` and the process
      // continuing would otherwise resolve a second time and, worse, draw into
      // a destroyed renderer.
      if (settled) return;
      settled = true;
      picker.destroy();
      renderer.destroy();
      resolve(value);
    };

    renderer.keyInput.on("keypress", (event) => {
      // Space is not in the keymap — it is this screen's own verb, and binding
      // it globally would take it away from anything that later wants to type.
      if (event.name === "space" || event.sequence === " ") {
        picker.toggle();
        return;
      }
      switch (resolveAction(event)) {
        case "roster.next":
        case "scroll.lineDown":
          picker.move(1);
          break;
        case "roster.prev":
        case "scroll.lineUp":
          picker.move(-1);
          break;
        // Enter installs from anywhere in the list, not only on the submit row.
        // The row is an affordance that says the key exists; requiring the
        // cursor to be parked on it would be a second step for no gain.
        case "roster.open":
          finish(picker.result());
          break;
        case "app.quit":
          finish(null);
          break;
        default:
          if (event.name === "escape") finish(null);
          break;
      }
    });
  });
}
