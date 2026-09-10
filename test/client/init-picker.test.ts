import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { InitPicker, renderRow, rowsFor, selectableIndexes } from "../../src/client/screens/init-picker";
import type { Row } from "../../src/client/screens/init-picker";
import type { PlanItem } from "../../src/installer/init-plan";

function item(over: Partial<PlanItem> = {}): PlanItem {
  return {
    id: "skill:claude",
    kind: "skill",
    group: "Skill — every project on this machine",
    scope: "user",
    label: "Claude Code",
    path: "/home/someone/.claude/skills/startup-room/SKILL.md",
    detail: "/home/someone/.claude/skills/startup-room/SKILL.md",
    selected: false,
    ...over,
  };
}

const PLAN: PlanItem[] = [
  item({ id: "a", group: "One", label: "Claude Code", selected: true }),
  item({ id: "b", group: "One", label: "Codex" }),
  item({ id: "c", group: "Two", label: "Cursor", done: "already there" }),
];

describe("the init picker's row list", () => {
  test("a header opens each group, a blank row separates them, and submit is last", () => {
    const rows = rowsFor(PLAN);
    expect(rows.map((r) => r.kind)).toEqual(["header", "item", "item", "header", "header", "item", "submit"]);
    expect((rows[0] as { text: string }).text).toBe("One");
    // The blank row before the second group. Three headers stacked against
    // their lists with no gap read as one list with captions in it.
    expect((rows[3] as { text: string }).text).toBe("");
    expect((rows[4] as { text: string }).text).toBe("Two");
  });

  test("the cursor cannot land on a header", () => {
    const rows = rowsFor(PLAN);
    const selectable = selectableIndexes(rows);
    expect(selectable.every((i) => rows[i]?.kind !== "header")).toBe(true);
    // Three items plus the submit row.
    expect(selectable).toHaveLength(4);
  });
});

describe("a picker row", () => {
  const ROWS: Row[] = rowsFor(PLAN);
  const WIDTHS = [0, 1, 4, 10, 20, 30, 40, 60, 72, 80, 100, 140, 200];

  test("never draws wider than the pane, at any width", () => {
    for (const width of WIDTHS) {
      for (const row of ROWS) {
        for (const focused of [true, false]) {
          expect(renderRow(row, width, focused).length).toBeLessThanOrEqual(Math.max(0, width - 1));
        }
      }
    }
  });

  test("the checkbox says what will happen", () => {
    expect(renderRow({ kind: "item", item: item({ selected: true }) }, 200, false)).toContain("[x]");
    expect(renderRow({ kind: "item", item: item({ selected: false }) }, 200, false)).toContain("[ ]");
  });

  test("an already-there note survives a narrow pane, because the path is what gets cut", () => {
    // Same lesson as the archive list's missing-log sigil: the short warning
    // goes ahead of the long field, or truncation eats the warning and a row
    // that will overwrite something reads as a fresh install.
    for (const width of [40, 50, 60, 80, 120]) {
      expect(renderRow({ kind: "item", item: item({ done: "already there" }) }, width, false)).toContain("already");
    }
  });

  test("the focused row is marked, and it is the only difference", () => {
    const row: Row = { kind: "item", item: item() };
    const focused = renderRow(row, 200, true);
    const plain = renderRow(row, 200, false);
    expect(focused.startsWith(">")).toBe(true);
    expect(focused.slice(1)).toBe(plain.slice(1));
  });
});

describe("driving the picker", () => {
  async function picker(): Promise<{ picker: InitPicker; plan: PlanItem[]; destroy: () => void }> {
    const { renderer } = await createTestRenderer({ width: 100, height: 24 });
    const plan = PLAN.map((p) => ({ ...p }));
    const p = new InitPicker(renderer, plan, { width: 100, height: 24 });
    renderer.root.add(p.node);
    return { picker: p, plan, destroy: () => renderer.destroy() };
  }

  test("space toggles the focused item, and nothing else", async () => {
    const { picker: p, plan, destroy } = await picker();
    expect(plan[0]?.selected).toBe(true);
    p.toggle();
    expect(plan[0]?.selected).toBe(false);
    expect(plan[1]?.selected).toBe(false);
    expect(plan[2]?.selected).toBe(false);
    destroy();
  });

  test("moving walks items across group boundaries and wraps", async () => {
    const { picker: p, plan, destroy } = await picker();
    p.move(1);
    p.toggle();
    expect(plan[1]?.selected).toBe(true);
    // Third item is in the second group — a header sits between them and must
    // not cost a keypress.
    p.move(1);
    p.toggle();
    expect(plan[2]?.selected).toBe(true);
    destroy();
  });

  test("the submit row is not a checkbox — toggling on it changes nothing", async () => {
    const { picker: p, plan, destroy } = await picker();
    p.move(-1); // wraps backwards onto submit
    p.toggle();
    expect(plan.map((i) => i.selected)).toEqual([true, false, false]);
    destroy();
  });
});

describe("the picker on a terminal too short for the plan", () => {
  test("draws nothing into its own border, and keeps submit visible", async () => {
    // The plan is nine skill rows today and grows by a row per runtime. Laid
    // out flat it overflowed a 22-row terminal by one and drew the hint line
    // straight through the bottom border — the same defect, from the same
    // cause, as the help overlay's off-by-one. The rows scroll; the submit row
    // and the hints are pinned outside the scroll box.
    const { createTestRenderer } = await import("@opentui/core/testing");
    const { buildPlan } = await import("../../src/installer/init-plan");
    const plan = buildPlan({ cwd: "/p", exists: () => true });

    for (const height of [8, 12, 16, 20, 24]) {
      const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 100, height });
      const p = new InitPicker(renderer, plan.map((i) => ({ ...i })), { width: 100, height });
      renderer.root.add(p.node);
      await renderOnce();
      const frame = captureCharFrame();

      for (const line of frame.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("└") || trimmed.startsWith("┌")) {
          expect(trimmed).toMatch(/^[┌└][─]+[┐┘]$|^┌─ roomyx init.*[┐]$/);
        }
      }
      expect(frame).toContain("[ Install ]");
      renderer.destroy();
    }
  }, 20000);
});
