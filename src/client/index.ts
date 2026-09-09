#!/usr/bin/env bun
import { join } from "node:path";
import { createCliRenderer } from "@opentui/core";
import { RoomClient } from "./mcp-client";
import { ChatView } from "./screens/chat-view";
import { AgentModal } from "./screens/agent-modal";
import type { RosterEntry } from "../log/types";
import { resolveConnectionUrl } from "../installer/resolve-connection";
import { IDLE, ownerPromptLine, stepOwnerPrompt } from "./owner-prompt";
import type { OwnerPromptState } from "./owner-prompt";

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

export async function runClient(argv: string[] = process.argv.slice(2)): Promise<void> {
  const flags = parseFlags(argv);
  const registryPath = flags["registry"] ?? join(process.cwd(), ".roomyx", "rooms", "registry.json");

  const resolved = await resolveConnectionUrl({
    connect: flags.connect,
    room: flags.room,
    registryPath,
  });

  if (!resolved.ok) {
    if (resolved.reason === "no-rooms") {
      console.error("No live roomyx rooms found. Start one with `roomyx serve <logPath>` first.");
    } else if (resolved.reason === "room-not-found") {
      console.error(`No live room with id "${flags.room}". Run \`roomyx rooms list\` to see what's running.`);
    } else {
      const ids = (resolved.candidates ?? []).map((r) => r.id).join(", ");
      console.error(`Multiple live rooms found (${ids}). Pick one with --room <id>.`);
    }
    process.exit(1);
  }
  const url = resolved.url;

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

  let prompt: OwnerPromptState = IDLE;

  function showPrompt(): void {
    chatView.statusBar.setNotice(ownerPromptLine(prompt));
  }

  renderer.keyInput.on("keypress", (event) => {
    if (modal.isVisible()) {
      if (event.name === "escape") modal.hide();
      return;
    }

    // The prompt owns the keyboard while it is open — otherwise typing "q"
    // into a veto would quit the client.
    if (prompt.stage !== "idle" || (event.name === "o" && !event.ctrl)) {
      const stepped = stepOwnerPrompt(prompt, event);
      prompt = stepped.state;
      showPrompt();
      if (stepped.action.type === "send") {
        const { kind, body } = stepped.action;
        chatView.statusBar.setNotice(`${kind}: sending…`);
        void roomClient
          .postOwnerCommand(kind, body)
          .then((result) => {
            chatView.statusBar.setNotice(
              result.accepted
                ? `${kind} accepted${result.reason ? ` — ${result.reason}` : ""}`
                : `${kind} not accepted — ${result.reason ?? "no reason given"}`,
            );
          })
          .catch((error: unknown) => {
            chatView.statusBar.setNotice(
              `${kind} failed — ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
      return;
    }

    // Any other key clears a leftover result line and falls through.
    chatView.statusBar.setNotice(null);

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

if (import.meta.main) {
  runClient().catch((error) => {
    // The message, not the object: a stack trace dumped at someone who simply
    // hasn't started a room yet reads as a crash, and matches how cli.ts already
    // reports its own failures.
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
