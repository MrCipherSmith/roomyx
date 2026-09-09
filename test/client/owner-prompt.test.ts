import { describe, expect, test } from "bun:test";
import { IDLE, ownerPromptLine, stepOwnerPrompt } from "../../src/client/owner-prompt";
import type { OwnerPromptState } from "../../src/client/owner-prompt";

function type(state: OwnerPromptState, keys: Array<{ name: string; sequence?: string; ctrl?: boolean }>) {
  let current = state;
  let last = stepOwnerPrompt(current, { name: "" });
  for (const key of keys) {
    last = stepOwnerPrompt(current, key);
    current = last.state;
  }
  return { state: current, action: last.action };
}

describe("owner command prompt", () => {
  test("idle passes ordinary keys through untouched", () => {
    for (const name of ["up", "down", "return", "q"]) {
      const { state, action } = stepOwnerPrompt(IDLE, { name, sequence: name });
      expect(state).toEqual(IDLE);
      expect(action.type).toBe("none");
    }
  });

  test("`o` opens the kind picker and the line explains the four choices", () => {
    const { state } = stepOwnerPrompt(IDLE, { name: "o", sequence: "o" });
    expect(state.stage).toBe("kind");
    const line = ownerPromptLine(state) ?? "";
    for (const hint of ["(v)eto", "(c)onstraint", "(a)dd", "(g)oal"]) {
      expect(line).toContain(hint);
    }
  });

  test("ctrl-o is not the same key and does not open the prompt", () => {
    expect(stepOwnerPrompt(IDLE, { name: "o", sequence: "o", ctrl: true }).state).toEqual(IDLE);
  });

  test("picking a kind and typing a body sends exactly what was typed", () => {
    const { action } = type(IDLE, [
      { name: "o", sequence: "o" },
      { name: "v", sequence: "v" },
      { name: "d", sequence: "d" },
      { name: "r", sequence: "r" },
      { name: "o", sequence: "o" },
      { name: "p", sequence: "p" },
      { name: "return" },
    ]);
    expect(action).toEqual({ type: "send", kind: "veto", body: "drop" });
  });

  test("each letter maps to its kind", () => {
    const cases: Array<[string, string]> = [
      ["v", "veto"],
      ["c", "constraint"],
      ["a", "add_participant"],
      ["g", "goal_edit"],
    ];
    for (const [letter, kind] of cases) {
      const { action } = type(IDLE, [
        { name: "o", sequence: "o" },
        { name: letter, sequence: letter },
        { name: "x", sequence: "x" },
        { name: "return" },
      ]);
      expect(action).toEqual({ type: "send", kind: kind as never, body: "x" });
    }
  });

  test("a typo at the kind picker is ignored rather than throwing the prompt away", () => {
    const { state } = type(IDLE, [
      { name: "o", sequence: "o" },
      { name: "z", sequence: "z" },
    ]);
    expect(state.stage).toBe("kind");
  });

  test("backspace edits the body, and Enter on an empty body sends nothing", () => {
    const { state, action } = type(IDLE, [
      { name: "o", sequence: "o" },
      { name: "c", sequence: "c" },
      { name: "x", sequence: "x" },
      { name: "backspace" },
      { name: "return" },
    ]);
    expect(action.type).toBe("none");
    expect(state).toEqual({ stage: "body", kind: "constraint", buffer: "" });
  });

  test("Esc cancels from either stage and returns to idle", () => {
    expect(type(IDLE, [{ name: "o", sequence: "o" }, { name: "escape" }])).toEqual({
      state: IDLE,
      action: { type: "cancel" },
    });
    expect(
      type(IDLE, [
        { name: "o", sequence: "o" },
        { name: "v", sequence: "v" },
        { name: "x", sequence: "x" },
        { name: "escape" },
      ]).action,
    ).toEqual({ type: "cancel" });
  });

  test("`q` typed into a body is text, not a quit — the prompt owns the keyboard", () => {
    const { action } = type(IDLE, [
      { name: "o", sequence: "o" },
      { name: "g", sequence: "g" },
      { name: "q", sequence: "q" },
      { name: "return" },
    ]);
    expect(action).toEqual({ type: "send", kind: "goal_edit", body: "q" });
  });

  test("idle shows no prompt line, so the status bar keeps the goal statement", () => {
    expect(ownerPromptLine(IDLE)).toBeNull();
  });
});
