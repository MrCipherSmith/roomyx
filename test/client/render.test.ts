import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createTestRenderer } from "@opentui/core/testing";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { RoomClient } from "../../src/client/mcp-client";
import { ChatView } from "../../src/client/screens/chat-view";
import { resolveAction } from "../../src/client/keymap";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let activeHandle: ServeHandle | undefined;
let activeClient: RoomClient | undefined;

afterEach(async () => {
  await activeClient?.stop();
  activeClient = undefined;
  await activeHandle?.close();
  activeHandle = undefined;
});

async function setUpChatView() {
  activeHandle = await serve(FIXTURE, { port: 0 });
  const { renderer, mockInput, renderOnce, waitFor, captureCharFrame } = await createTestRenderer({
    width: 100,
    height: 30,
  });

  const chatView = new ChatView(renderer, {
    width: 100,
    height: 30,
    onSelectAgent: (agent) => chatView.setFilter(agent.id),
  });
  renderer.root.add(chatView.node);

  activeClient = new RoomClient(
    { url: activeHandle.url, stateIntervalMs: 20, transcriptIntervalMs: 20 },
    {
      onStateUpdate: (state) => {
        chatView.setGoalContract(state.goal_contract);
        chatView.setRoster(state.roster);
      },
      onNewMessages: (messages) => chatView.appendMessages(messages),
      onConnectionChange: (status) => chatView.setConnectionStatus(status),
    },
  );
  activeClient.start();

  // Dispatches through the real keymap rather than a hand-copied if/else, so
  // this test cannot pass against a keymap the client does not have. The
  // previous version mirrored the wiring by hand and said so in a comment,
  // which is the same promise without the enforcement.
  renderer.keyInput.on("keypress", (event) => {
    const action = resolveAction(event);
    if (action === "roster.prev") chatView.roster.moveSelection(-1);
    else if (action === "roster.next") chatView.roster.moveSelection(1);
    else if (action === "roster.open") chatView.roster.confirmSelection();
    else if (action === "filter.clear") chatView.setFilter(null);
    else if (action === "help.toggle") chatView.help.toggle();
  });

  return { renderer, mockInput, renderOnce, waitFor, captureCharFrame, chatView };
}

/**
 * Waits for a condition, not for a duration.
 *
 * The fixed 200 ms this replaces had under a 2x margin on an idle machine —
 * measured by lowering it: 150 ms passed, 100 ms failed one test, 60 ms failed
 * two. A 2-vCPU CI runner is an ordinary 2x slowdown, and this is the one file
 * that certifies the TUI actually paints, so the failure mode was a red CI run
 * on a correct tree. The file already imported `waitFor` and then neutered it as
 * `waitFor(() => true)`.
 */
async function until(
  renderOnce: () => Promise<void>,
  captureCharFrame: () => string,
  predicate: (frame: string) => boolean,
  what: string,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    await renderOnce();
    if (predicate(captureCharFrame())) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("TUI rendering (real @opentui/core headless renderer, real serve() instance)", () => {
  test("chat view renders the roster, messages, and goal statement", async () => {
    const { renderOnce, captureCharFrame } = await setUpChatView();
    await until(renderOnce, captureCharFrame, (f) => f.includes("polling"), "the first message body");
    const frame = captureCharFrame();

    expect(frame).toContain("Юки");
    expect(frame).toContain("Омар");
    expect(frame).toContain("Зара");
    expect(frame).toContain("roomyx MCP server MVP");
    // A message body, not only the chrome. The suite used to assert the frame
    // and never the picture, which is how a pane that drew no messages at all
    // reached a published release.
    expect(frame).toContain("polling");
  });

  test("selecting a participant filters the stream in place, and Esc brings the room back", async () => {
    const { mockInput, renderOnce, captureCharFrame, chatView } = await setUpChatView();
    await until(renderOnce, captureCharFrame, (f) => f.includes("Модалка"), "the whole transcript");

    mockInput.typeText("j"); // move off Юки onto Омар
    mockInput.pressEnter();
    await until(renderOnce, captureCharFrame, () => chatView.transcript.filter() === "omar", "the filter to apply");

    // Омар's own turn stays; Зара's goes. The filter happens in the same pane,
    // so the roster is still readable beside it rather than covered by a window.
    expect(chatView.transcript.filter()).toBe("omar");
    const filtered = captureCharFrame();
    expect(filtered).toContain("polling");
    expect(filtered).not.toContain("Модалка");
    expect(filtered).toContain("Зара"); // still in the roster

    mockInput.pressEscape();
    await until(renderOnce, captureCharFrame, () => chatView.transcript.filter() === null, "the filter to clear");
    expect(captureCharFrame()).toContain("Модалка");
  });

  test("`?` shows the keymap, and it lists keys the footer has no room for", async () => {
    const { mockInput, renderOnce, captureCharFrame, chatView } = await setUpChatView();
    await until(renderOnce, captureCharFrame, (f) => f.includes("Модалка"), "the transcript");
    expect(captureCharFrame()).not.toContain("write out");

    mockInput.typeText("?");
    await until(renderOnce, captureCharFrame, () => chatView.help.isVisible(), "the overlay to open");
    const open = captureCharFrame();
    expect(open).toContain("keys");
    expect(open).toContain("write out");
    expect(open).toContain("top/bottom");
    expect(open).toContain("? or Esc closes");

    mockInput.typeText("?");
    await until(renderOnce, captureCharFrame, () => !chatView.help.isVisible(), "the overlay to close");
    expect(captureCharFrame()).not.toContain("write out");
  });
});
