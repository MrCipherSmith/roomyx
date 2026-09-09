import { OWNER_COMMAND_KINDS } from "../server/index";
import type { OwnerCommandKind } from "../server/index";

/**
 * The owner-command prompt, as a pure state machine.
 *
 * Kept separate from `index.ts` because that file cannot run without a real
 * terminal: it builds a renderer on import. The composing logic — which keys
 * open the prompt, what a half-typed command looks like, when Enter actually
 * sends — is the part worth testing, so it lives where a test can reach it.
 */

export type OwnerPromptState =
  | { stage: "idle" }
  | { stage: "kind" }
  | { stage: "body"; kind: OwnerCommandKind; buffer: string };

export type OwnerPromptAction =
  | { type: "none" }
  | { type: "cancel" }
  | { type: "send"; kind: OwnerCommandKind; body: string };

export interface PromptKey {
  name: string;
  sequence?: string;
  ctrl?: boolean;
}

/** First letter of each kind, which is what the prompt asks for. */
const KIND_BY_LETTER: Record<string, OwnerCommandKind> = {
  v: "veto",
  c: "constraint",
  a: "add_participant",
  g: "goal_edit",
};

export const IDLE: OwnerPromptState = { stage: "idle" };

/** The state the prompt starts in once the keymap has decided to open it. */
export const OPENED: OwnerPromptState = { stage: "kind" };

/** The status line to show for a state, or null to leave the bar alone. */
export function ownerPromptLine(state: OwnerPromptState): string | null {
  if (state.stage === "idle") return null;
  if (state.stage === "kind") {
    return "owner command — (v)eto (c)onstraint (a)dd participant (g)oal edit, Esc to cancel";
  }
  return `${state.kind}: ${state.buffer}▌  (Enter to send, Esc to cancel)`;
}

function isPrintable(key: PromptKey): boolean {
  return !key.ctrl && typeof key.sequence === "string" && key.sequence.length === 1 && key.sequence >= " ";
}

export function stepOwnerPrompt(
  state: OwnerPromptState,
  key: PromptKey,
): { state: OwnerPromptState; action: OwnerPromptAction } {
  const none = (next: OwnerPromptState) => ({ state: next, action: { type: "none" } as OwnerPromptAction });

  if (state.stage === "idle") {
    // Idle never opens itself. Which key opens the prompt is the keymap's
    // decision and it is written down in exactly one place (`keymap.ts`); this
    // machine used to hardcode `o` as well, so the two could disagree — and
    // when the opening key changed, one of them would have been left behind
    // still answering to the old one.
    return none(state);
  }

  if (key.name === "escape") {
    return { state: IDLE, action: { type: "cancel" } };
  }

  if (state.stage === "kind") {
    const kind = KIND_BY_LETTER[key.sequence ?? ""];
    // An unrecognised letter is ignored rather than cancelling: a typo should
    // not throw away a prompt the person deliberately opened.
    return kind ? none({ stage: "body", kind, buffer: "" }) : none(state);
  }

  if (key.name === "return") {
    // An empty body is not a command. Stay put rather than sending nothing.
    if (state.buffer.trim().length === 0) return none(state);
    return { state: IDLE, action: { type: "send", kind: state.kind, body: state.buffer.trim() } };
  }

  if (key.name === "backspace") {
    return none({ ...state, buffer: state.buffer.slice(0, -1) });
  }

  if (isPrintable(key)) {
    return none({ ...state, buffer: state.buffer + key.sequence });
  }

  return none(state);
}

export { OWNER_COMMAND_KINDS };
export type { OwnerCommandKind };
