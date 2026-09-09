import { describe, expect, test } from "bun:test";
import type { ParsedKey } from "@opentui/core";
import { BINDINGS, footerHints, resolveAction } from "../../src/client/keymap";

function key(partial: Partial<ParsedKey> & { sequence?: string }): ParsedKey {
  return {
    name: partial.name ?? "",
    ctrl: partial.ctrl ?? false,
    meta: false,
    shift: partial.shift ?? false,
    option: false,
    sequence: partial.sequence ?? partial.name ?? "",
    number: false,
    raw: "",
    eventType: "press",
    source: "raw",
  } as ParsedKey;
}

describe("the keymap", () => {
  test("the arrows scroll the transcript, and j/k move the roster", () => {
    // This is the whole point of the rebind. Before it, the arrows moved the
    // roster and nothing scrolled, so a room taller than the pane could not be
    // read back at all.
    expect(resolveAction(key({ name: "up" }))).toBe("scroll.lineUp");
    expect(resolveAction(key({ name: "down" }))).toBe("scroll.lineDown");
    expect(resolveAction(key({ name: "k", sequence: "k" }))).toBe("roster.prev");
    expect(resolveAction(key({ name: "j", sequence: "j" }))).toBe("roster.next");
  });

  test("page and half-page movement use the conventional keys", () => {
    expect(resolveAction(key({ name: "pageup" }))).toBe("scroll.pageUp");
    expect(resolveAction(key({ name: "pagedown" }))).toBe("scroll.pageDown");
    expect(resolveAction(key({ name: "u", sequence: "u", ctrl: true }))).toBe("scroll.halfUp");
    expect(resolveAction(key({ name: "d", sequence: "d", ctrl: true }))).toBe("scroll.halfDown");
  });

  test("g and G are told apart by sequence, not by a shift flag", () => {
    // Whether shifted G arrives as name "G", or as name "g" with shift set,
    // depends on the terminal and on the kitty protocol. The sequence is the
    // field that says the same thing either way.
    expect(resolveAction(key({ name: "g", sequence: "g" }))).toBe("scroll.top");
    expect(resolveAction(key({ name: "g", sequence: "G", shift: true }))).toBe("scroll.bottom");
  });

  test("`:` opens the owner prompt, and `o` still does for anyone who learned it", () => {
    expect(resolveAction(key({ name: ":", sequence: ":" }))).toBe("owner.prompt");
    expect(resolveAction(key({ name: "o", sequence: "o" }))).toBe("owner.prompt");
  });

  test("ctrl-modified letters are not their bare selves", () => {
    // ^D is half-page-down; a plain `d` is not bound at all, and must not fall
    // through to it.
    expect(resolveAction(key({ name: "d", sequence: "d" }))).toBeNull();
    // ^Q is not quit.
    expect(resolveAction(key({ name: "q", sequence: "q", ctrl: true }))).toBeNull();
    expect(resolveAction(key({ name: "q", sequence: "q" }))).toBe("app.quit");
    expect(resolveAction(key({ name: "c", sequence: "c", ctrl: true }))).toBe("app.quit");
  });

  test("an unbound key resolves to nothing rather than to the nearest match", () => {
    for (const k of ["z", "1", "x", "%"]) {
      expect(resolveAction(key({ name: k, sequence: k }))).toBeNull();
    }
  });

  test("search, filter, help and export have keys, and they are the conventional ones", () => {
    expect(resolveAction(key({ name: "/", sequence: "/" }))).toBe("search.open");
    expect(resolveAction(key({ name: "n", sequence: "n" }))).toBe("search.next");
    expect(resolveAction(key({ name: "n", sequence: "N", shift: true }))).toBe("search.previous");
    expect(resolveAction(key({ name: "escape" }))).toBe("filter.clear");
    expect(resolveAction(key({ name: "?", sequence: "?" }))).toBe("help.toggle");
    expect(resolveAction(key({ name: "w", sequence: "w" }))).toBe("transcript.export");
  });

  test("no two bindings claim the same key", () => {
    // The invariant that makes a first-match-wins resolver safe: without it, a
    // binding added later can be silently shadowed by one added earlier, and
    // the footer would advertise a key that never fires.
    const claimed = new Map<string, string>();
    for (const binding of BINDINGS) {
      for (const pattern of binding.patterns) {
        const id = "seq" in pattern ? `seq:${pattern.seq}` : `name:${pattern.name}:${pattern.ctrl ?? false}`;
        const owner = claimed.get(id);
        expect(owner ?? binding.action).toBe(binding.action);
        claimed.set(id, binding.action);
      }
    }
  });

  test("the footer's hints are generated from the bindings, not written beside them", () => {
    const hints = footerHints();
    for (const binding of BINDINGS.filter((b) => b.footer)) {
      expect(hints).toContain(binding.keys);
      expect(hints).toContain(binding.hint);
    }
    // And it advertises the key it wants taught, not the one kept for
    // compatibility.
    expect(hints).toContain(": command");
    expect(hints).not.toContain("o command");
  });

  test("a narrow footer drops hints one at a time, keeping the most useful", () => {
    // The first version dropped all of them at once, which took the keys away
    // on an empty room and on any scrolled room — the two states where a
    // newcomer most needs to be told what exists.
    const full = footerHints();
    const half = footerHints(Math.floor(full.length / 2));
    expect(half.length).toBeLessThan(full.length);
    expect(half.length).toBeGreaterThan(0);
    // Scrolling is what the arrows do and it is the reason the rebind happened;
    // it is the last hint to go.
    expect(half).toContain("↑/↓ scroll");
    expect(footerHints(12)).toBe("↑/↓ scroll");
    expect(footerHints(0)).toBe("");
  });

  test("hints never exceed the width they were given", () => {
    for (let width = 0; width <= footerHints().length + 4; width += 1) {
      expect(footerHints(width).length).toBeLessThanOrEqual(width);
    }
  });
});
