import { createRoomMcpServer } from "./index";
import type { RoomMcpServerOptions } from "./index";
import { serveMcpOverHttp } from "./http-transport";
import type { McpHttpTransportHandle } from "./http-transport";
import { loadRoomLog } from "../log/store";

export interface ServeOptions extends RoomMcpServerOptions {
  /** Defaults to 4319 (specification.md's default). 0 selects an ephemeral port. */
  port?: number;
  host?: string;
  acknowledgeNonLoopback?: boolean;
}

export type ServeHandle = McpHttpTransportHandle;

/**
 * Serves one room log over the shared loopback HTTP transport. Everything about
 * sessions, binding and shutdown lives in `./http-transport`; what belongs here
 * is which server a session gets and which port it defaults to.
 */
export async function serve(logPath: string, options: ServeOptions): Promise<ServeHandle> {
  // Read the log once before binding anything.
  //
  // Without this, `roomyx serve` on a log it cannot parse — a markdown
  // transcript, say, which is what the bundled skill used to tell a dispatcher
  // to write — succeeded loudly and then failed silently: it bound a port,
  // printed a room ID and an attach command, and every tool call threw. The
  // liveness probe treats a throwing `room.get_state` as "not this room", so
  // `roomyx rooms list` answered **"No live rooms"** about a server that was
  // running, and the client refused to attach to the id it had just been given.
  //
  // Failing here costs one read and turns an invisible room into a sentence
  // that names the file and the line.
  loadRoomLog(logPath);

  return serveMcpOverHttp({
    createMcpServer: () => createRoomMcpServer(logPath, { onOwnerCommand: options.onOwnerCommand }),
    commandLabel: "roomyx serve",
    defaultPort: 4319,
    port: options.port,
    host: options.host,
    acknowledgeNonLoopback: options.acknowledgeNonLoopback,
  });
}
