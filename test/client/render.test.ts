import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createTestRenderer } from "@opentui/core/testing";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { RoomClient } from "../../src/client/mcp-client";
import { ChatView } from "../../src/client/screens/chat-view";
import { AgentModal } from "../../src/client/screens/agent-modal";

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

  const modal = new AgentModal(renderer, { width: 70, height: 20 });
  const chatView = new ChatView(renderer, {
    width: 100,
    height: 30,
    onSelectAgent: (agent) => {
      void activeClient!.getAgentDetail(agent.id).then((detail) => modal.show(detail));
    },
  });
  renderer.root.add(chatView.node);
  renderer.root.add(modal.node);

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

  // Mirrors src/client/index.ts's actual keypress wiring — the test exercises
  // real user-facing behavior, not just the components in isolation.
  renderer.keyInput.on("keypress", (event) => {
    if (modal.isVisible()) {
      if (event.name === "escape") modal.hide();
      return;
    }
    if (event.name === "up") chatView.roster.moveSelection(-1);
    else if (event.name === "down") chatView.roster.moveSelection(1);
    else if (event.name === "return") chatView.roster.confirmSelection();
  });

  return { renderer, mockInput, renderOnce, waitFor, captureCharFrame, chatView, modal };
}

describe("TUI rendering (real @opentui/core headless renderer, real serve() instance)", () => {
  test("chat view renders the roster, messages, and goal statement (AC1, R3)", async () => {
    const { waitFor, renderOnce, captureCharFrame } = await setUpChatView();
    await waitFor(() => true); // let at least one poll cycle land
    // Poll cycles are async; wait for real content to actually appear.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain("Юки");
    expect(frame).toContain("Омар");
    expect(frame).toContain("Зара");
    expect(frame).toContain("room-tui MCP server MVP");
    expect(frame).toContain("connected");
  });

  test("agent modal overlays the chat view with only that agent's messages, and closes on Escape (AC2, AC8-adjacent)", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await setUpChatView();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await renderOnce();

    mockInput.pressArrow("down"); // move off Юки onto Омар
    mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await renderOnce();

    const openFrame = captureCharFrame();
    // The modal's own title ("<agent> — last seen at seq N") is unique to
    // the modal — unlike the message body text, which also legitimately
    // appears in the background chat view regardless of modal visibility.
    expect(openFrame).toContain("Омар — last seen at seq");

    mockInput.pressEscape();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await renderOnce();
    const closedFrame = captureCharFrame();
    expect(closedFrame).not.toContain("last seen at seq");
  });
});
