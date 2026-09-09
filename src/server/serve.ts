import { createRoomMcpServer } from "./index";
import type { RoomMcpServerOptions } from "./index";
import { serveMcpOverHttp } from "./http-transport";
import type { McpHttpTransportHandle } from "./http-transport";

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
  return serveMcpOverHttp({
    createMcpServer: () => createRoomMcpServer(logPath, { onOwnerCommand: options.onOwnerCommand }),
    commandLabel: "roomyx serve",
    defaultPort: 4319,
    port: options.port,
    host: options.host,
    acknowledgeNonLoopback: options.acknowledgeNonLoopback,
  });
}
