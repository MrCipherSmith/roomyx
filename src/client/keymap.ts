import type { ParsedKey } from "@opentui/core";

/**
 * The keymap as data, in one place.
 *
 * It used to be an `else if` chain inside the keypress handler in `index.ts`,
 * which is why the map could be wrong without being visibly wrong: there was
 * no artefact anyone could read to answer "what keys does this have?". Adding
 * a binding meant editing behaviour; now it means adding a row, and the footer
 * and any future help screen are generated from the same rows rather than
 * written by hand beside them. A footer that can disagree with the dispatcher
 * is worse than no footer.
 */
export type Action =
  | "scroll.lineUp"
  | "scroll.lineDown"
  | "scroll.pageUp"
  | "scroll.pageDown"
  | "scroll.halfUp"
  | "scroll.halfDown"
  | "scroll.top"
  | "scroll.bottom"
  | "roster.prev"
  | "roster.next"
  | "roster.open"
  | "owner.prompt"
  | "app.quit";

/**
 * Printable keys match on `sequence` rather than on `name` + `shift`, because
 * whether `G` arrives as name "G" or as name "g" with shift set depends on the
 * terminal and on whether the kitty protocol is in play. The sequence is the
 * one field that says the same thing either way.
 */
type KeyPattern = { seq: string } | { name: string; ctrl?: boolean };

export interface Binding {
  action: Action;
  patterns: KeyPattern[];
  /** How the key is written for a reader, e.g. "↑/↓". */
  keys: string;
  /** What it does, in one or two words. */
  hint: string;
  /** Whether it earns a place in the compact footer. */
  footer: boolean;
  /**
   * Which hints survive a narrow terminal. Higher goes first. Without this the
   * footer dropped all of its hints at once the moment it did not fit — which
   * happened on an empty room and on any scrolled room, the two states where a
   * newcomer most needs to be told which keys exist.
   */
  footerRank?: number;
}

export const BINDINGS: Binding[] = [
  // The transcript owns the arrows. Every pager anyone has used binds them to
  // the content — less, tmux copy-mode, k9s. Before this they moved the roster
  // selection, so four keypresses on a room taller than the pane moved one
  // caret and nothing else, which reads as a frozen pane rather than as a
  // keymap you have to learn.
  { action: "scroll.lineUp", patterns: [{ name: "up" }], keys: "↑/↓", hint: "scroll", footer: true, footerRank: 0 },
  { action: "scroll.lineDown", patterns: [{ name: "down" }], keys: "↑/↓", hint: "scroll", footer: false },
  { action: "scroll.pageUp", patterns: [{ name: "pageup" }], keys: "PgUp/PgDn", hint: "page", footer: true, footerRank: 5 },
  { action: "scroll.pageDown", patterns: [{ name: "pagedown" }], keys: "PgUp/PgDn", hint: "page", footer: false },
  { action: "scroll.halfUp", patterns: [{ name: "u", ctrl: true }], keys: "^U/^D", hint: "half page", footer: false },
  { action: "scroll.halfDown", patterns: [{ name: "d", ctrl: true }], keys: "^U/^D", hint: "half page", footer: false },
  { action: "scroll.top", patterns: [{ seq: "g" }], keys: "g/G", hint: "top/bottom", footer: false },
  { action: "scroll.bottom", patterns: [{ seq: "G" }], keys: "g/G", hint: "top/bottom", footer: false },

  // The roster keeps a selection, so it needs its own movement keys. j/k is
  // what the same fingers already use for lists in vim, lazygit and k9s.
  { action: "roster.prev", patterns: [{ seq: "k" }], keys: "j/k", hint: "roster", footer: true, footerRank: 2 },
  { action: "roster.next", patterns: [{ seq: "j" }], keys: "j/k", hint: "roster", footer: false },
  { action: "roster.open", patterns: [{ name: "return" }], keys: "Enter", hint: "open", footer: true, footerRank: 4 },

  // `:` is the free key and already means "I am about to type a command"
  // everywhere. `o` means *open* everywhere, so it was borrowed rather than
  // chosen; it still works, undocumented, so a script or a habit from 0.5.0
  // does not break on upgrade — but the footer teaches `:`.
  { action: "owner.prompt", patterns: [{ seq: ":" }, { seq: "o" }], keys: ":", hint: "command", footer: true, footerRank: 3 },

  { action: "app.quit", patterns: [{ seq: "q" }, { name: "c", ctrl: true }], keys: "q", hint: "quit", footer: true, footerRank: 1 },
];

function matches(pattern: KeyPattern, event: ParsedKey): boolean {
  // A printable-sequence binding must not fire while ctrl is held: ctrl+letter
  // is a different key, and most terminals send it as a control character
  // rather than as the letter — but not all, and a matcher that only looked at
  // the sequence would have let Ctrl-Q quit.
  if ("seq" in pattern) return !event.ctrl && event.sequence === pattern.seq;
  return event.name === pattern.name && event.ctrl === (pattern.ctrl ?? false);
}

export function resolveAction(event: ParsedKey): Action | null {
  for (const binding of BINDINGS) {
    if (binding.patterns.some((pattern) => matches(pattern, event))) return binding.action;
  }
  return null;
}

/**
 * The footer's key hints, in binding order, trimmed to fit `width` by dropping
 * the least useful ones first rather than dropping all of them at once.
 * Returns "" when not even one hint fits.
 */
export function footerHints(width = Number.POSITIVE_INFINITY): string {
  const entries = BINDINGS.filter((binding) => binding.footer).map((binding, order) => ({
    order,
    rank: binding.footerRank ?? 0,
    text: `${binding.keys} ${binding.hint}`,
  }));

  const render = (kept: typeof entries) =>
    kept
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.text)
      .join(" · ");

  let kept = entries;
  while (kept.length > 0 && render(kept).length > width) {
    let worst = 0;
    for (let i = 1; i < kept.length; i += 1) {
      const candidate = kept[i];
      const current = kept[worst];
      if (candidate && current && candidate.rank > current.rank) worst = i;
    }
    kept = kept.filter((_, i) => i !== worst);
  }
  return render(kept);
}
