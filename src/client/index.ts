#!/usr/bin/env bun
import { join } from "node:path";
import { createCliRenderer } from "@opentui/core";
import { RoomClient } from "./mcp-client";
import { ChatView } from "./screens/chat-view";
import { AgentModal } from "./screens/agent-modal";
import type { RosterEntry } from "../log/types";
import { resolveConnectionUrl } from "../installer/resolve-connection";
import { IDLE, OPENED, ownerPromptLine, stepOwnerPrompt } from "./owner-prompt";
import type { OwnerPromptState } from "./owner-prompt";
import { resolveAction } from "./keymap";
import type { Action } from "./keymap";
import { livenessLine } from "./liveness";
import type { ConnectionStatus } from "./mcp-client";
import { ArgError, parseArgs, renderFlags } from "../cli/args";
import type { FlagValues } from "../cli/args";
import { CLIENT_FLAGS } from "../cli/specs";

/**
 * Takes already-parsed flags rather than argv, so the two entry points — this
 * file as a binary, and `roomyx client` — cannot disagree about what a flag
 * means. They previously had one scanner each, which is how a bare
 * `--registry` became `""` here (and `""` is not nullish, so it beat the
 * default) while becoming `true` in the other.
 */
export async function runClient(flags: FlagValues): Promise<void> {
  const registryPath =
    typeof flags.registry === "string" ? flags.registry : join(process.cwd(), ".roomyx", "rooms", "registry.json");

  const resolved = await resolveConnectionUrl({
    connect: typeof flags.connect === "string" ? flags.connect : undefined,
    room: typeof flags.room === "string" ? flags.room : undefined,
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

  let messageCount = 0;
  let lastMessageAt: number | null = null;
  let connection: ConnectionStatus = "connecting";

  function refreshFooter(): void {
    chatView.footer.setLiveness(
      livenessLine({ status: connection, messageCount, lastMessageAt, now: Date.now() }),
    );
    // Only say something when the reader is *not* where new messages land —
    // a permanent "at bottom" would be another word that always says the same
    // thing, which is the habit this footer exists to break.
    chatView.footer.setScrollNote(chatView.isAtBottom() ? null : "scrolled up · G to follow");
  }

  const roomClient = new RoomClient(
    { url },
    {
      onConnectionChange: (status) => {
        const previous = connection;
        connection = status;
        chatView.setConnectionStatus(status);
        // Also into the transcript, not only the footer: a repainted footer
        // row is never spoken by a screen reader and never survives a `tee`.
        if (previous !== status && previous !== "connecting") {
          chatView.appendSystemLine(status === "connected" ? "reconnected" : "disconnected, retrying");
        }
        refreshFooter();
      },
      onStateUpdate: (state) => {
        chatView.setGoalContract(state.goal_contract);
        chatView.setRoster(state.roster);
      },
      onNewMessages: (messages) => {
        chatView.appendMessages(messages);
        if (messages.length > 0) {
          messageCount += messages.length;
          lastMessageAt = Date.now();
        }
        refreshFooter();
      },
    },
  );
  roomClient.start();

  // The footer carries an age, so it has to repaint on its own — otherwise
  // "last 4s ago" would sit there unchanged through a silence, which is the
  // exact failure it was added to prevent.
  const footerTimer = setInterval(refreshFooter, 1000);
  refreshFooter();

  let prompt: OwnerPromptState = IDLE;

  function showPrompt(): void {
    chatView.statusBar.setNotice(ownerPromptLine(prompt));
  }

  function openOwnerPrompt(): void {
    prompt = OPENED;
    showPrompt();
  }

  /**
   * Order matters, and it is the whole fix: stop polling **before** tearing the
   * renderer down. The other way round, an in-flight poll loses its connection
   * during teardown, calls `handleDisconnect`, and writes "disconnected" into a
   * text buffer the renderer has already destroyed — which throws
   * `TextBuffer is destroyed` and dumps ten frames of stack at someone who
   * just closed a window.
   *
   * `q` and Ctrl-C always went through this path. Signals did not go through
   * anything at all, so `kill` on an attached client produced exactly that
   * trace. They share one exit now.
   */
  let shuttingDown = false;
  function shutdown(code: number): void {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(footerTimer);
    void roomClient.stop().finally(() => {
      renderer.destroy();
      process.exit(code);
    });
  }

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => shutdown(0));
  }

  renderer.keyInput.on("keypress", (event) => {
    if (modal.isVisible()) {
      if (event.name === "escape") modal.hide();
      return;
    }

    // The prompt owns the keyboard while it is open — otherwise typing "q"
    // into a veto would quit the client.
    if (prompt.stage !== "idle") {
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

    const action = resolveAction(event);
    if (action === null) return;

    // One row per action rather than a chain of conditions, so the set of
    // things a key can do is a list you can read, and adding one cannot
    // accidentally shadow an earlier branch.
    const half = Math.max(1, Math.floor(chatView.pageSize() / 2));
    const handlers: Record<Action, () => void> = {
      "scroll.lineUp": () => chatView.scrollByLines(-1),
      "scroll.lineDown": () => chatView.scrollByLines(1),
      "scroll.pageUp": () => chatView.scrollByLines(-chatView.pageSize()),
      "scroll.pageDown": () => chatView.scrollByLines(chatView.pageSize()),
      "scroll.halfUp": () => chatView.scrollByLines(-half),
      "scroll.halfDown": () => chatView.scrollByLines(half),
      "scroll.top": () => chatView.scrollToTop(),
      "scroll.bottom": () => chatView.scrollToBottom(),
      "roster.prev": () => chatView.roster.moveSelection(-1),
      "roster.next": () => chatView.roster.moveSelection(1),
      "roster.open": () => chatView.roster.confirmSelection(),
      "owner.prompt": () => openOwnerPrompt(),
      "app.quit": () => shutdown(0),
    };
    handlers[action]();
    refreshFooter();
  });
}

const CLIENT_USAGE = ["roomyx-client [flags]", "", "  attach the terminal UI to a live room", "", renderFlags(CLIENT_FLAGS)].join(
  "\n",
);

if (import.meta.main) {
  void (async () => {
    try {
      const parsed = parseArgs(process.argv.slice(2), CLIENT_FLAGS);
      if (parsed.help) {
        console.log(CLIENT_USAGE);
        return;
      }
      await runClient(parsed.flags);
    } catch (error) {
      // The message, not the object: a stack trace dumped at someone who
      // simply hasn't started a room yet reads as a crash, and matches how
      // cli.ts reports its own failures.
      if (error instanceof ArgError) {
        console.error(error.message);
      } else {
        console.error(error instanceof Error ? error.message : String(error));
      }
      process.exit(1);
    }
  })();
}
