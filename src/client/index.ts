#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCliRenderer } from "@opentui/core";
import { RoomClient } from "./mcp-client";
import { ChatView } from "./screens/chat-view";
import type { RosterEntry } from "../log/types";
import { resolveConnectionUrl } from "../installer/resolve-connection";
import { IDLE, OPENED, ownerPromptLine, stepOwnerPrompt } from "./owner-prompt";
import type { OwnerPromptState } from "./owner-prompt";
import { resolveAction } from "./keymap";
import type { Action } from "./keymap";
import { livenessLine } from "./liveness";
import { CLOSED, opened, searchPromptLine, stepSearchPrompt } from "./search-prompt";
import type { SearchPromptState } from "./search-prompt";
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

  // Selecting a participant filters the stream in place instead of opening a
  // window over it. The modal this replaces could not be scrolled, did not
  // compose with search, cost a keypress to leave, and was pinned at hardcoded
  // coordinates across the roster it had been opened from.
  const chatView = new ChatView(renderer, {
    width: renderer.terminalWidth,
    height: renderer.terminalHeight,
    onSelectAgent: (agent: RosterEntry) => applyFilter(agent),
  });

  renderer.root.add(chatView.node);

  let filtered: RosterEntry | null = null;
  let matchCursor = -1;

  function applyFilter(agent: RosterEntry | null): void {
    filtered = agent;
    chatView.setFilter(agent?.id ?? null);
    matchCursor = -1;
    chatView.scrollToBottom();
    refreshFooter();
  }

  let messageCount = 0;
  let lastMessageAt: number | null = null;
  let connection: ConnectionStatus = "connecting";
  let participants = 0;

  function refreshFooter(): void {
    const liveness = livenessLine({ status: connection, messageCount, lastMessageAt, now: Date.now() });
    // On a terminal too narrow for the roster, the footer is the only place
    // that still says how many people are in the room.
    const here = chatView.isRosterVisible() || participants === 0 ? "" : `${participants} here · `;
    // A filter or a search that is on but invisible is the worst of both: the
    // pane looks like a quiet room. `less` prints a single `&` for the same
    // reason, and k9s puts the live filter in the view title.
    const filterNote = filtered === null ? "" : `filter: ${filtered.name} · `;
    const query = chatView.transcript.currentQuery();
    const total = chatView.transcript.matches().length;
    const searchNote =
      query === "" ? "" : `/${query} ${total === 0 ? "no matches" : `${matchCursor + 1}/${total}`} · `;
    chatView.footer.setLiveness(`${filterNote}${searchNote}${here}${liveness}`);
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
      // The room answered and the answer was an error — usually a malformed
      // line in the log. It reaches the transcript, where it is readable and
      // survives a scroll, rather than being thrown away.
      onToolError: (message) => {
        chatView.appendSystemLine(message);
        refreshFooter();
      },
      onStateUpdate: (state) => {
        chatView.setGoalContract(state.goal_contract);
        chatView.setRoster(state.roster);
        participants = state.roster.length;
        refreshFooter();
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

  let search: SearchPromptState = CLOSED;

  function showSearch(): void {
    chatView.statusBar.setNotice(searchPromptLine(search));
  }

  function jumpTo(index: number | null, direction: string): void {
    if (index === null) {
      chatView.statusBar.setNotice(`no match for "${chatView.transcript.currentQuery()}"`);
      matchCursor = -1;
    } else {
      matchCursor = chatView.transcript.matches().indexOf(index);
      chatView.scrollToEntry(index);
      chatView.statusBar.setNotice(null);
    }
    void direction;
    refreshFooter();
  }

  /**
   * Where `n` and `N` start counting from: the match cursor if a search is
   * already underway, otherwise the end of the transcript, so the first `n`
   * after a fresh `/` wraps to the earliest match rather than jumping from
   * wherever the last search happened to leave off.
   */
  function currentEntryIndex(): number {
    const matches = chatView.transcript.matches();
    const at = matches[matchCursor];
    return at ?? -1;
  }

  /**
   * Writes what is on screen to a file and names the path.
   *
   * Claude Code's transcript viewer dumps into the terminal's own scrollback so
   * tmux copy-mode and the terminal's find can reach it. roomyx cannot leave
   * the alternate screen safely while the room is still streaming into it, so
   * it writes a file instead — same purpose, which is to get the text somewhere
   * the reader's existing tools already work.
   *
   * It never overwrites: `wx` fails if the path exists and the loop takes the
   * next free suffix. Silently replacing an export someone took a minute ago is
   * exactly the kind of small theft a keystroke should not be able to commit.
   */
  function exportTranscript(): void {
    const base = `roomyx-transcript${filtered === null ? "" : `-${filtered.id}`}`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const name = `${base}${attempt === 0 ? "" : `-${attempt}`}.txt`;
      const path = join(process.cwd(), name);
      try {
        writeFileSync(path, `${chatView.transcript.toText()}\n`, { encoding: "utf8", flag: "wx" });
        // The name, not the absolute path: the status bar is one line and
        // truncates, and an absolute path under a deep working directory gets
        // cut exactly where the filename would have been. The file is in the
        // directory the client was started from.
        chatView.statusBar.setNotice(`written to ./${name}`);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        chatView.statusBar.setNotice(
          `could not write ${path} — ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
    }
    chatView.statusBar.setNotice(`${base}.txt and 99 numbered siblings all exist — nothing written`);
  }

  renderer.keyInput.on("keypress", (event) => {
    // The help overlay swallows the keyboard, so a key pressed at a screen
    // explaining the keys does not also fire the thing it explains.
    if (chatView.help.isVisible()) {
      if (event.name === "escape" || event.sequence === "?") chatView.help.hide();
      return;
    }

    if (search.open) {
      const stepped = stepSearchPrompt(search, event);
      search = stepped.state;
      showSearch();
      if (stepped.action.type === "search") {
        chatView.setQuery(stepped.action.query);
        chatView.statusBar.setNotice(null);
        if (stepped.action.query !== "") jumpTo(chatView.transcript.nextMatch(-1), "next");
        else refreshFooter();
      } else if (stepped.action.type === "cancel") {
        chatView.statusBar.setNotice(null);
      }
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
      "filter.clear": () => applyFilter(null),
      "search.open": () => {
        search = opened();
        showSearch();
      },
      "search.next": () => jumpTo(chatView.transcript.nextMatch(currentEntryIndex()), "next"),
      "search.previous": () => jumpTo(chatView.transcript.previousMatch(currentEntryIndex()), "previous"),
      "owner.prompt": () => openOwnerPrompt(),
      "transcript.export": () => exportTranscript(),
      "help.toggle": () => chatView.help.toggle(),
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
