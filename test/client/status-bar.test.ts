import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { StatusBar } from "../../src/client/components/status-bar";

/**
 * The status bar is one line with `wrapMode: "none"`, so anything longer than
 * the pane was cut mid-word with nothing to say it had been cut. R12 names both
 * victims: the goal's threshold — the number the room exists to cross — was not
 * shown at all, and an owner command's answer was truncated mid-sentence ("…the
 * command. A", from a real veto against a dispatcher-less room).
 */

const GOAL = {
  version: 1,
  goal_statement: "Decide whether the roomyx MCP server MVP is ready to review.",
  criteria: "AC1-AC5",
  threshold: { fail_below: 60, pass_at_or_above: 80 },
};

async function line(width: number, set: (bar: StatusBar) => void): Promise<string> {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width, height: 4 });
  const bar = new StatusBar(renderer, { width });
  renderer.root.add(bar.node);
  set(bar);
  await renderOnce();
  const frame = captureCharFrame();
  renderer.destroy();
  return (frame.split("\n").find((l) => l.trim().length > 0) ?? "").trimEnd();
}

describe("the status bar shows the number the room exists to cross", () => {
  test("the threshold is on the line", async () => {
    const text = await line(120, (bar) => bar.setGoalContract(GOAL));
    expect(text).toContain("Decide whether");
    // 80 is the pass mark; without it the reader cannot tell how close the room
    // is to done, and the room's whole purpose is that number.
    expect(text).toContain("80");
  });

  test("a goal with no threshold does not invent one", async () => {
    const text = await line(120, (bar) =>
      bar.setGoalContract({ ...GOAL, threshold: { fail_below: 0, pass_at_or_above: 0 } }),
    );
    expect(text).toContain("Decide whether");
    expect(text).not.toContain("≥ 0");
  });
});

describe("a line too long for the pane says so", () => {
  test("the goal is clipped with a marker, not silently cut", async () => {
    const text = await line(40, (bar) => bar.setGoalContract(GOAL));
    // The primitive the client already has, rather than a second cutter: the
    // point is the marker, because a truncated goal with no sign of truncation
    // reads as a complete goal that happens to be short.
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(40);
  });

  test("an owner command's answer is clipped with a marker too", async () => {
    // The real truncated string, from a veto against a room with no dispatcher.
    const refusal =
      "veto not accepted — No dispatcher is attached to this server, so there is nothing to act on the command. A";
    const text = await line(60, (bar) => bar.setNotice(refusal));
    expect(text.endsWith("…")).toBe(true);
    expect(text).toContain("veto not accepted");
  });

  test("a short line is left exactly as it is", async () => {
    const text = await line(120, (bar) => bar.setNotice("veto: sending…"));
    expect(text).toBe("veto: sending…");
  });
});

describe("the notice owns the line while it is set", () => {
  test("it replaces the goal, and clearing it hands the line back", async () => {
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 120, height: 4 });
    const bar = new StatusBar(renderer, { width: 120 });
    renderer.root.add(bar.node);
    bar.setGoalContract(GOAL);
    bar.setConnectionStatus("connected");
    await renderOnce();
    const withGoal = captureCharFrame();

    bar.setNotice("veto: sending…");
    await renderOnce();
    const withNotice = captureCharFrame();
    expect(withGoal).toContain("Decide whether");
    expect(withNotice).not.toContain("Decide whether");
    expect(withNotice).toContain("veto: sending…");

    bar.setNotice(null);
    await renderOnce();
    const restored = captureCharFrame();
    expect(restored).toContain("Decide whether");
    renderer.destroy();
  });
});
