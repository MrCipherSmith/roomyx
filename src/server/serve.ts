import { createRoomMcpServer } from "./index";
import type { RoomMcpServerOptions } from "./index";
import { serveMcpOverHttp } from "./http-transport";
import type { McpHttpTransportHandle } from "./http-transport";
import { loadRoomLog } from "../log/store";
import {
  LEASE_HEARTBEAT_MS,
  acquireWriterLease,
  refreshWriterLease,
  releaseWriterLease,
} from "../writer-lease";

export interface ServeOptions extends RoomMcpServerOptions {
  /** Defaults to 4319 (specification.md's default). 0 selects an ephemeral port. */
  port?: number;
  host?: string;
  acknowledgeNonLoopback?: boolean;
  /**
   * Where the writer lease lives, when this server has a dispatcher attached.
   * Defaults to none: an embedder that does not dispatch holds nothing, and a
   * library caller should not acquire a lease as a side effect of binding.
   */
  writerLeasePath?: string;
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

  const handle = await serveMcpOverHttp({
    createMcpServer: () => createRoomMcpServer(logPath, { onOwnerCommand: options.onOwnerCommand }),
    commandLabel: "roomyx serve",
    defaultPort: 4319,
    port: options.port,
    host: options.host,
    acknowledgeNonLoopback: options.acknowledgeNonLoopback,
  });

  // The lease is held by the process that has a dispatcher, which is this one —
  // a server with no dispatcher is an observer, and holding a lease would claim
  // a pen it never picks up.
  if (options.onOwnerCommand === undefined || options.writerLeasePath === undefined) return handle;

  const leasePath = options.writerLeasePath;
  const lease = acquireWriterLease(leasePath, { pid: process.pid });
  // `unref()`, so an idle heartbeat cannot be the reason the process stays
  // alive — the same rule the transport's session sweeper follows.
  const heartbeat = setInterval(() => {
    refreshWriterLease(leasePath, lease.token);
  }, LEASE_HEARTBEAT_MS);
  heartbeat.unref();

  return {
    ...handle,
    close: async () => {
      clearInterval(heartbeat);
      releaseWriterLease(leasePath, lease.token);
      await handle.close();
    },
  };
}
