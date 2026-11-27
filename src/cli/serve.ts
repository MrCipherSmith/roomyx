import { resolve } from "node:path";
import { serve } from "../server/serve";
import { registerRoom, deregisterRoom } from "../installer/registry";
import { archiveRoom, defaultHistoryPath } from "../installer/history";
import { ArgError } from "./args";
import { REGISTRY_FLAG, defaultRegistryPath, runUntilSignal } from "./shared";
import type { Command } from "./shared";

export const serveCommand: Command = {
  usage: "roomyx serve <logPath> [flags]",
  summary: "serve a room log over MCP",
  flags: {
    port: { type: "number", describe: "Listen port (default 4319; 0 picks an ephemeral one)" },
    host: { type: "string", describe: "Bind address (default 127.0.0.1)" },
    "acknowledge-non-loopback": { type: "boolean", describe: "Required to bind a non-loopback host" },
    registry: REGISTRY_FLAG,
  },
  run: async ({ positionals, flags }) => {
    const logPath = positionals[0];
    if (!logPath) throw new ArgError("Missing <logPath>.");

    // Absolute, because the registry outlives this process's working
    // directory: `roomyx-client` resolves rooms from wherever the person
    // happened to run it, and a relative logPath means nothing there.
    const absoluteLogPath = resolve(logPath);
    // Resolved before binding: the writer lease lives beside the registry, and
    // a server that acquires one after it starts answering would leave a
    // window where a live dispatcher looks like no writer at all.
    const registryPath = typeof flags.registry === "string" ? flags.registry : defaultRegistryPath();
    const handle = await serve(absoluteLogPath, {
      port: typeof flags.port === "number" ? flags.port : undefined,
      host: typeof flags.host === "string" ? flags.host : undefined,
      acknowledgeNonLoopback: flags["acknowledge-non-loopback"] === true,
      // No `writerLeasePath`, deliberately, and this is worth stating because
      // it was passed here and silently discarded on every serve.
      //
      // `serve()` takes the lease only when a dispatcher is attached, and
      // "attached" means an *embedder* supplied an `onOwnerCommand` callback.
      // `roomyx serve` never supplies one — an agent dispatcher has no
      // callback to give; it reads `room.get_pending_owner_commands` instead.
      // So the argument could never be used, while reading like a lease was
      // being taken.
      //
      // Making the CLI declare a dispatcher was tried and is WRONG: the lease
      // would be held by the server process, while the writer is the agent
      // running `roomyx room append` in a different process each time — so
      // the dispatcher would be locked out of its own room. Two dispatcher
      // models exist (embedder writes in-process; agent writes by CLI) and
      // only the first is expressible today. Recorded rather than patched.
    });

    const entry = registerRoom(registryPath, {
      port: handle.port,
      logPath: absoluteLogPath,
      pid: process.pid,
      // The token goes where the port goes. Anything that can find this room
      // can find its credential, and nothing else has to be told — which is the
      // whole of how `roomyx-client`, `rooms list` and the room commands keep
      // working without a new argument between them.
      token: handle.token,
    });

    // Deliberately NOT printed. The port and the room id are the two things a
    // person needs and the two things they paste into a terminal, an issue or a
    // chat; the token is a credential, and stdout is a scrollback, a CI log and
    // a `tee`. Whoever needs it reads the registry entry.
    console.log(`roomyx serving ${absoluteLogPath} at ${handle.url}`);
    console.log(`room ID: ${entry.id} — attach with \`roomyx-client --room ${entry.id}\``);

    runUntilSignal(
      () => handle.close(),
      () => {
        // Archive before deregistering, not after: `archiveRoom` reads the
        // log to summarise it, and it reads better while the entry that says
        // where the log is still exists. The order also means a crash
        // between the two leaves the room recorded in history and still in
        // the registry, which the next prune resolves — rather than gone
        // from both.
        archiveRoom(defaultHistoryPath(registryPath), entry);
        deregisterRoom(registryPath, entry.id);
      },
    );
  },
};
