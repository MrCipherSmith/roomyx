#!/usr/bin/env bun
import { join, resolve } from "node:path";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { RoomClient } from "./mcp-client";
import { resolveConnectionUrl } from "../installer/resolve-connection";
import { IDLE, OPENED, ownerPromptLine, stepOwnerPrompt } from "./owner-prompt";
import type { OwnerPromptState } from "./owner-prompt";
import { livenessLine } from "./liveness";
import { createShutdown } from "./shutdown";
import { Viewer } from "./viewer";
import { resolveAction } from "./keymap";
import { ArchiveList } from "./screens/archive-list";
import { defaultHistoryPath, readHistory } from "../installer/history";
import type { RoomHistoryRow } from "../installer/history";
import { loadRoomLog } from "../log/store";
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
 *
 * Three modes, and only the first one needs a server: attach to a live room,
 * reread one closed room by path (`--open`), or pick a closed room from the
 * history index (`--archive`). Everything the reader does once a transcript is
 * on screen is the same in all three and lives in `./viewer`.
 */
export async function runClient(flags: FlagValues): Promise<void> {
  const registryPath =
    typeof flags.registry === "string" ? flags.registry : join(process.cwd(), ".roomyx", "rooms", "registry.json");

  if (typeof flags.open === "string") {
    await runArchived(resolve(flags.open), null);
    return;
  }
  if (flags.archive === true) {
    await runArchivePicker(defaultHistoryPath(registryPath));
    return;
  }

  const resolved = await resolveConnectionUrl({
    connect: typeof flags.connect === "string" ? flags.connect : undefined,
    room: typeof flags.room === "string" ? flags.room : undefined,
    registryPath,
  });

  if (!resolved.ok) {
    if (resolved.reason === "no-rooms") {
      console.error("No live roomyx rooms found. Start one with `roomyx serve <logPath>` first.");
      // The rooms that have ended are the other half of the answer, and the
      // person who just got "no live rooms" is usually looking for one of them.
      const { rooms } = readHistory(defaultHistoryPath(registryPath));
      if (rooms.length > 0) {
        console.error(`${rooms.length} closed room(s) recorded — reread them with \`roomyx-client --archive\`.`);
      }
    } else if (resolved.reason === "room-not-found") {
      console.error(`No live room with id "${flags.room}". Run \`roomyx rooms list\` to see what's running.`);
    } else {
      const ids = (resolved.candidates ?? []).map((r) => r.id).join(", ");
      console.error(`Multiple live rooms found (${ids}). Pick one with --room <id>.`);
    }
    process.exit(1);
  }

  await runLive(resolved.url);
}

/** Attached to a room that is still running: polling, owner commands, liveness. */
async function runLive(url: string): Promise<void> {
  const renderer = await createCliRenderer({ targetFps: 30 });

  let messageCount = 0;
  let lastMessageAt: number | null = null;
  let connection: ConnectionStatus = "connecting";
  let prompt: OwnerPromptState = IDLE;

  const viewer = new Viewer({
    renderer,
    quit: () => shutdown(0),
    status: () => livenessLine({ status: connection, messageCount, lastMessageAt, now: Date.now() }),
    onOwnerPrompt: () => {
      prompt = OPENED;
      showPrompt();
    },
    // The prompt owns the keyboard while it is open — otherwise typing "q"
    // into a veto would quit the client.
    beforeKey: (event) => {
      if (prompt.stage === "idle") return false;
      const stepped = stepOwnerPrompt(prompt, event);
      prompt = stepped.state;
      showPrompt();
      if (stepped.action.type === "send") {
        const { kind, body } = stepped.action;
        viewer.chatView.statusBar.setNotice(`${kind}: sending…`);
        void roomClient
          .postOwnerCommand(kind, body)
          .then((result) => {
            // Three answers, three sentences. `queued` is not a refusal: the
            // command is held for a dispatcher that has not read it yet, and
            // showing that as "not accepted" would report the feature working as
            // the feature failing.
            const sentence = {
              queued: `${kind} queued — a dispatcher reads it with room.get_pending_owner_commands`,
              accepted: `${kind} accepted${result.reason ? ` — ${result.reason}` : ""}`,
              refused: `${kind} refused — ${result.reason ?? "no reason given"}`,
            }[result.status];
            viewer.chatView.statusBar.setNotice(sentence);
          })
          .catch((error: unknown) => {
            viewer.chatView.statusBar.setNotice(
              `${kind} failed — ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
      return true;
    },
  });

  function showPrompt(): void {
    viewer.chatView.statusBar.setNotice(ownerPromptLine(prompt));
  }

  const roomClient = new RoomClient(
    { url },
    {
      onConnectionChange: (status) => {
        const previous = connection;
        connection = status;
        viewer.chatView.setConnectionStatus(status);
        // Also into the transcript, not only the footer: a repainted footer
        // row is never spoken by a screen reader and never survives a `tee`.
        if (previous !== status && previous !== "connecting") {
          viewer.chatView.appendSystemLine(status === "connected" ? "reconnected" : "disconnected, retrying");
        }
        viewer.refreshFooter();
      },
      // The room answered and the answer was an error — usually a malformed
      // line in the log. It reaches the transcript, where it is readable and
      // survives a scroll, rather than being thrown away.
      onToolError: (message) => {
        viewer.chatView.appendSystemLine(message);
        viewer.refreshFooter();
      },
      onStateUpdate: (state) => {
        viewer.chatView.setGoalContract(state.goal_contract);
        viewer.chatView.setRoster(state.roster);
        viewer.setParticipants(state.roster.length);
        viewer.refreshFooter();
      },
      onNewMessages: (messages) => {
        viewer.chatView.appendMessages(messages);
        if (messages.length > 0) {
          messageCount += messages.length;
          lastMessageAt = Date.now();
        }
        viewer.refreshFooter();
      },
    },
  );
  roomClient.start();

  // The footer carries an age, so it has to repaint on its own — otherwise
  // "last 4s ago" would sit there unchanged through a silence, which is the
  // exact failure it was added to prevent.
  const footerTimer = setInterval(() => viewer.refreshFooter(), 1000);
  viewer.refreshFooter();

  // The ordering and the re-entry guard live in `./shutdown` so they can be
  // tested; see that file for why the order is the fix. `q`, Ctrl-C and all
  // three signals share this one exit.
  const shutdown = createShutdown({
    stopClient: async () => {
      clearInterval(footerTimer);
      await roomClient.stop();
    },
    destroyRenderer: () => renderer.destroy(),
    exit: (code) => process.exit(code),
  });

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => shutdown(0));
  }

  renderer.keyInput.on("keypress", (event) => viewer.handleKey(event));
}

/**
 * Rereads a room that has ended. No server, no polling, no reconnect — the log
 * is a finished file, so it is read once and that is the whole of it.
 *
 * The log is loaded *before* the renderer starts. A room log that has been
 * moved, or that has a damaged line, must fail as a printed sentence — entering
 * the alternate screen first and then throwing leaves the terminal in a state
 * the person has to `reset` out of, with the error scrolled away behind it.
 */
async function runArchived(logPath: string, closed: RoomHistoryRow | null, renderer?: CliRenderer): Promise<void> {
  let loaded: ReturnType<typeof loadRoomLog>;
  try {
    loaded = loadRoomLog(logPath);
  } catch (error) {
    if (renderer) renderer.destroy();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const active = renderer ?? (await createCliRenderer({ targetFps: 30 }));

  // Static: nothing here changes after the file is read, so unlike the live
  // client this needs no repaint timer. What it says instead of a liveness age
  // is when the room closed, because "read-only" without a date is the same
  // word forever — the habit this footer exists to break.
  const status =
    `read-only · ${loaded.messages.length} messages` + (closed ? ` · closed ${closed.closedAt.slice(0, 10)}` : "");

  const shutdown = createShutdown({
    stopClient: async () => undefined,
    destroyRenderer: () => active.destroy(),
    exit: (code) => process.exit(code),
  });

  const viewer = new Viewer({ renderer: active, quit: () => shutdown(0), status: () => status });
  viewer.chatView.setGoalContract(loaded.state.goal_contract);
  viewer.chatView.setRoster(loaded.state.roster);
  viewer.setParticipants(loaded.state.roster.length);
  viewer.chatView.appendMessages(loaded.messages);
  // "closed" rather than a connection state: the status bar's other values all
  // describe a socket, and this room does not have one.
  viewer.chatView.setConnectionStatus("closed");
  viewer.chatView.scrollToTop();
  viewer.refreshFooter();

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => shutdown(0));
  }

  active.keyInput.on("keypress", (event) => viewer.handleKey(event));
}

/** The list of closed rooms; Enter opens the highlighted one read-only. */
async function runArchivePicker(historyPath: string): Promise<void> {
  const { rooms, unreadable } = readHistory(historyPath);
  if (rooms.length === 0) {
    // Printed rather than shown: a full-screen list you have to press q to
    // leave, in order to be told it is empty, is worse than a sentence.
    console.log("No closed rooms recorded yet.");
    console.log("A room is recorded when `roomyx serve` shuts down, or when `roomyx rooms list` finds it gone.");
    if (unreadable > 0) console.log(`${unreadable} history line(s) could not be read and were skipped.`);
    return;
  }

  const renderer = await createCliRenderer({ targetFps: 30 });
  const list = new ArchiveList(renderer, rooms, {
    width: renderer.terminalWidth,
    height: renderer.terminalHeight,
    unreadable,
  });
  renderer.root.add(list.node);

  const quit = createShutdown({
    stopClient: async () => undefined,
    destroyRenderer: () => renderer.destroy(),
    exit: (code) => process.exit(code),
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => quit(0));
  }

  // Through the shared keymap rather than its own key comparisons: this is a
  // list of rows navigated with j/k and opened with Enter, which is what the
  // roster already is, and two lists in one client that disagree about which
  // key moves down is exactly the kind of drift a printed keymap is supposed to
  // rule out.
  renderer.keyInput.on("keypress", (event) => {
    switch (resolveAction(event)) {
      // ↑/↓ scroll the transcript in the chat view, but a list has nothing else
      // to scroll — a key that moves in every other list and does nothing here
      // reads as the screen being frozen.
      case "roster.next":
      case "scroll.lineDown":
        list.moveSelection(1);
        break;
      case "roster.prev":
      case "scroll.lineUp":
        list.moveSelection(-1);
        break;
      case "app.quit":
        quit(0);
        break;
      case "roster.open": {
        const room = list.selected();
        if (room === null) return;
        // Freed, not merely unlinked: `remove()` leaves the native yoga nodes
        // and TextBuffers allocated, and the pool is finite. The chat view
        // built next wants those rows back.
        renderer.root.remove(list.node);
        list.destroy();
        void runArchived(room.logPath, room, renderer);
        break;
      }
      default:
        break;
    }
  });
}

const CLIENT_USAGE = [
  "roomyx-client [flags]",
  "",
  "  attach the terminal UI to a live room, or reread a closed one",
  "",
  renderFlags(CLIENT_FLAGS),
].join("\n");

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
