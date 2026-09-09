#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { RoomClient } from "./mcp-client";
import { ChatView } from "./screens/chat-view";
import { AgentModal } from "./screens/agent-modal";
import type { RosterEntry } from "../log/types";

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--")) {
      flags[arg.slice(2)] = args[i + 1] ?? "";
      i++;
    }
  }
  return flags;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const url = flags.connect ?? "http://127.0.0.1:4319/mcp";

  const renderer = await createCliRenderer({ targetFps: 30 });

  const modal = new AgentModal(renderer, {
    width: Math.floor(renderer.terminalWidth * 0.7),
    height: Math.floor(renderer.terminalHeight * 0.7),
  });

  const chatView = new ChatView(renderer, {
    width: renderer.terminalWidth,
    height: renderer.terminalHeight,
    onSelectAgent: (agent: RosterEntry) => {
      void roomClient.getAgentDetail(agent.id).then((detail) => modal.show(detail));
    },
  });

  renderer.root.add(chatView.node);
  renderer.root.add(modal.node);

  const roomClient = new RoomClient(
    { url },
    {
      onConnectionChange: (status) => chatView.setConnectionStatus(status),
      onStateUpdate: (state) => {
        chatView.setGoalContract(state.goal_contract);
        chatView.setRoster(state.roster);
      },
      onNewMessages: (messages) => chatView.appendMessages(messages),
    },
  );
  roomClient.start();

  renderer.keyInput.on("keypress", (event) => {
    if (modal.isVisible()) {
      if (event.name === "escape") modal.hide();
      return;
    }
    if (event.name === "up") chatView.roster.moveSelection(-1);
    else if (event.name === "down") chatView.roster.moveSelection(1);
    else if (event.name === "return") chatView.roster.confirmSelection();
    else if (event.name === "q" || (event.name === "c" && event.ctrl)) {
      void roomClient.stop().finally(() => {
        renderer.destroy();
        process.exit(0);
      });
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
