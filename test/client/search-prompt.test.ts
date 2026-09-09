import { describe, expect, test } from "bun:test";
import { CLOSED, opened, searchPromptLine, stepSearchPrompt } from "../../src/client/search-prompt";
import type { SearchPromptState } from "../../src/client/search-prompt";

function type(state: SearchPromptState, keys: Array<{ name: string; sequence?: string; ctrl?: boolean }>) {
  let current = state;
  let last = stepSearchPrompt(current, { name: "" });
  for (const key of keys) {
    last = stepSearchPrompt(current, key);
    current = last.state;
  }
  return { state: current, action: last.action };
}

const letters = (text: string) => [...text].map((char) => ({ name: char, sequence: char }));

describe("the search prompt", () => {
  test("closed, it consumes nothing — the view's own keys still work", () => {
    for (const key of [{ name: "q", sequence: "q" }, { name: "return" }, { name: "escape" }]) {
      const { state, action } = stepSearchPrompt(CLOSED, key);
      expect(state).toEqual(CLOSED);
      expect(action.type).toBe("none");
    }
  });

  test("typing builds a query and Enter searches for exactly what was typed", () => {
    const { action } = type(opened(), [...letters("scroll"), { name: "return" }]);
    expect(action).toEqual({ type: "search", query: "scroll" });
  });

  test("`q` and `/` typed into a search are text, not a quit and not a new search", () => {
    // The whole reason this is a mode: while it is open it owns the keyboard.
    const { action } = type(opened(), [...letters("q/n"), { name: "return" }]);
    expect(action).toEqual({ type: "search", query: "q/n" });
  });

  test("backspace edits, and Enter on an empty query clears the search", () => {
    const { action } = type(opened(), [...letters("ab"), { name: "backspace" }, { name: "backspace" }, { name: "return" }]);
    expect(action).toEqual({ type: "search", query: "" });
  });

  test("Esc cancels without searching", () => {
    const { state, action } = type(opened(), [...letters("half typed"), { name: "escape" }]);
    expect(state).toEqual(CLOSED);
    expect(action).toEqual({ type: "cancel" });
  });

  test("an arrow key does not type its escape sequence into the query", () => {
    // `sequence` for an arrow is a multi-character control sequence; a naive
    // "append the sequence" would put "[A" in the search box.
    const { state } = type(opened(), [
      ...letters("ab"),
      { name: "up", sequence: "[A" },
      { name: "left", sequence: "[D" },
    ]);
    expect(state.buffer).toBe("ab");
  });

  test("ctrl-modified keys are not text either", () => {
    const { state } = type(opened(), [...letters("ab"), { name: "u", sequence: "u", ctrl: true }]);
    expect(state.buffer).toBe("ab");
  });

  test("the line shows the query being typed, and nothing when closed", () => {
    expect(searchPromptLine(CLOSED)).toBeNull();
    const line = searchPromptLine(opened("scr")) ?? "";
    expect(line).toContain("/scr");
    expect(line).toContain("Esc to cancel");
  });
});
