import { listRoomsWithLiveness } from "../installer/registry";
import { defaultHistoryPath, readHistory } from "../installer/history";
import { REGISTRY_FLAG, defaultRegistryPath } from "./shared";
import type { Command } from "./shared";

export const roomsList: Command = {
  usage: "roomyx rooms list [flags]",
  summary: "live rooms, confirmed by a real call rather than by the file",
  flags: { registry: REGISTRY_FLAG },
  run: async ({ flags }) => {
    // `--registry` used to be accepted here and silently ignored: this
    // command took no arguments at all and read the default path, so
    // `rooms list --registry /nonexistent.json` printed "No live rooms"
    // about a different file.
    const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
    const { live, unconfirmed } = await listRoomsWithLiveness(registryPath);
    if (live.length === 0 && unconfirmed.length === 0) {
      // An empty registry and a registry whose rooms did not answer are
      // different facts, and the second used to print this same sentence —
      // which is how a serving room came to look like no room at all.
      console.log("No live rooms.");
      return;
    }
    for (const room of live) {
      console.log(`${room.id}  port=${room.port}  log=${room.logPath}  started=${room.startedAt}`);
    }
    for (const room of unconfirmed) {
      // Kept in the registry, not claimed live: the probe did not answer, and
      // "did not answer" is not permission to delete a room that may be
      // serving. Named so the reader knows what to re-check.
      console.log(
        `${room.id}  port=${room.port}  log=${room.logPath}  started=${room.startedAt}  did not answer — still registered`,
      );
    }
  },
};

export const roomsHistory: Command = {
  usage: "roomyx rooms history [flags]",
  summary: "rooms that have closed, newest first",
  notes:
    "History records what a room was and where its log is — it does not copy\n  the log. Reopen one read-only with `roomyx-client --open <logPath>`, or\n  pick from the list with `roomyx-client --archive`.",
  flags: { registry: REGISTRY_FLAG },
  run: async ({ flags }) => {
    const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
    const { rooms, unreadable } = readHistory(defaultHistoryPath(registryPath));
    if (rooms.length === 0) {
      console.log("No closed rooms recorded yet.");
    }
    for (const room of rooms) {
      const when = room.closedAt.slice(0, 16).replace("T", " ");
      const goal = room.goal === "" ? "(goal unavailable)" : room.goal;
      console.log(
        `${room.id}  closed=${when}  messages=${room.messages}  participants=${room.participants}  ${goal}`,
      );
      // The path on its own line: it is the argument to --open, and a goal
      // statement is long enough that putting them on one line means the
      // thing you have to copy is the thing that gets wrapped.
      console.log(`    ${room.logPath}${room.logExists ? "" : "  (log no longer at this path)"}`);
    }
    if (unreadable > 0) {
      console.log(`\n${unreadable} history line(s) could not be read and were skipped.`);
    }
  },
};
