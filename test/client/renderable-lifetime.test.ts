import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { Renderable } from "@opentui/core";
import { ChatView } from "../../src/client/screens/chat-view";
import type { MessageEnvelope } from "../../src/log/types";

/**
 * The client used to kill itself while sitting idle.
 *
 * `remove()` in @opentui/core unlinks a child; it does not free it. The native
 * yoga node and the TextBuffer are released only by `destroy()`, and the native
 * renderable pool is finite — so this was a hard ceiling rather than a slow
 * leak. `setRoster` rebuilt every row unconditionally and `onStateUpdate` calls
 * it on every `room.get_state` poll, three seconds apart, whether or not the
 * roster changed: five leaked renderables per poll, pool exhausted in about
 * 2.7 hours, and the crash then reported itself as a lost connection.
 *
 * These assert the registry size directly, because that is the resource that
 * ran out. Nothing observable at the frame level would have caught it.
 */

function registry(): Map<number, unknown> {
  return (Renderable as unknown as { renderablesByNumber: Map<number, unknown> }).renderablesByNumber;
}

/**
 * The highest renderable number handed out so far.
 *
 * The map's *size* is a net count, and net is the wrong instrument for half of
 * this: with the skip-unchanged-roster short-circuit deleted, 100 identical
 * polls destroy five rows and allocate five rows each time, so the size is
 * unchanged at the end and the test passes. An independent mutation pass caught
 * that — the case named "allocate nothing" was certifying the destroy and
 * certifying the skip zero times. Allocation is monotonic, so the highest key
 * separates "allocated nothing" from "allocated and freed five hundred".
 */
function allocations(): number {
  let highest = 0;
  for (const key of registry().keys()) if (key > highest) highest = key;
  return highest;
}

const ROSTER = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, name: `Agent ${i}` }));

async function view(width = 100, height = 24) {
  const { renderer, renderOnce } = await createTestRenderer({ width, height });
  const chat = new ChatView(renderer, { width, height });
  renderer.root.add(chat.node);
  return { chat, renderOnce, destroy: () => renderer.destroy() };
}

describe("renderable lifetime", () => {
  test("repeated identical state polls allocate nothing", async () => {
    const v = await view();
    v.chat.setRoster(ROSTER);
    await v.renderOnce();

    const beforeSize = registry().size;
    const beforeAllocations = allocations();
    for (let i = 0; i < 100; i += 1) v.chat.setRoster(ROSTER);
    await v.renderOnce();

    // 100 polls is five minutes of a live room. It used to cost 500 renderables.
    expect(registry().size).toBe(beforeSize);
    // And nothing was allocated at all — which is the half the net count cannot
    // see, and the half `sameRoster` exists for.
    expect(allocations()).toBe(beforeAllocations);
    v.destroy();
  });

  test("a roster that really changes is rebuilt, and the old rows are freed", async () => {
    const v = await view();
    v.chat.setRoster(ROSTER);
    await v.renderOnce();
    const before = registry().size;

    // Same length, one renamed — the cheap identity check must not miss this.
    const renamed = ROSTER.map((entry, i) => (i === 2 ? { ...entry, name: "Renamed" } : entry));
    v.chat.setRoster(renamed);
    await v.renderOnce();
    expect(registry().size).toBe(before);

    for (let i = 0; i < 20; i += 1) {
      v.chat.setRoster(i % 2 === 0 ? ROSTER : renamed);
    }
    await v.renderOnce();
    expect(registry().size).toBe(before);
    v.destroy();
  });

  test("filtering back and forth does not accumulate rows", async () => {
    const v = await view();
    v.chat.setRoster([
      { id: "a", name: "Ann" },
      { id: "b", name: "Bob" },
    ]);
    const messages: MessageEnvelope[] = Array.from({ length: 60 }, (_, i) => ({
      seq: i + 1,
      from: i % 2 === 0 ? "a" : "b",
      body: `message ${i}`,
    }));
    v.chat.appendMessages(messages);
    await v.renderOnce();

    v.chat.setFilter("a");
    await v.renderOnce();
    const afterFirstFilter = registry().size;

    for (let i = 0; i < 12; i += 1) {
      v.chat.setFilter(i % 2 === 0 ? null : "a");
    }
    await v.renderOnce();

    // A dozen toggles on a long room used to exhaust the pool outright.
    expect(registry().size).toBeLessThanOrEqual(afterFirstFilter);
    v.destroy();
  });
});
