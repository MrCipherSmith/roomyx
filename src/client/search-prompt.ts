/**
 * The `/` search line, as a pure state machine.
 *
 * Same shape and the same reason as `owner-prompt.ts`: keeping the typing rules
 * out of the keypress handler is what lets them be tested without a terminal,
 * and it is why "a `q` typed into a search is text, not a quit" is a property
 * you can assert rather than a thing you hope someone remembered.
 *
 * Which key *opens* the prompt is not decided here — that lives in `keymap.ts`,
 * in one place. The owner prompt used to hardcode its own opening key as well
 * as having one in the dispatcher, and the two could have drifted apart.
 */
export interface SearchPromptState {
  open: boolean;
  buffer: string;
}

export const CLOSED: SearchPromptState = { open: false, buffer: "" };

export function opened(initial = ""): SearchPromptState {
  return { open: true, buffer: initial };
}

export type SearchPromptAction =
  | { type: "none" }
  | { type: "cancel" }
  | { type: "search"; query: string };

export interface PromptKey {
  name: string;
  sequence?: string;
  ctrl?: boolean;
}

export function searchPromptLine(state: SearchPromptState): string | null {
  if (!state.open) return null;
  return `/${state.buffer}▌  (Enter to search, Esc to cancel)`;
}

export function stepSearchPrompt(
  state: SearchPromptState,
  key: PromptKey,
): { state: SearchPromptState; action: SearchPromptAction } {
  if (!state.open) return { state, action: { type: "none" } };

  if (key.name === "escape") return { state: CLOSED, action: { type: "cancel" } };

  if (key.name === "return") {
    // An empty query clears the search rather than matching everything, which
    // is what `//` does in the pagers this borrows from.
    return { state: CLOSED, action: { type: "search", query: state.buffer } };
  }

  if (key.name === "backspace") {
    return { state: { open: true, buffer: state.buffer.slice(0, -1) }, action: { type: "none" } };
  }

  // Only real printable input extends the buffer. Without the length check an
  // arrow key, whose sequence is an escape sequence, would type its whole
  // control sequence into the query.
  const char = key.sequence ?? "";
  if (!key.ctrl && char.length === 1 && char >= " ") {
    return { state: { open: true, buffer: state.buffer + char }, action: { type: "none" } };
  }

  return { state, action: { type: "none" } };
}
