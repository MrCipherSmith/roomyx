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
  let lease;
  try {
    lease = acquireWriterLease(leasePath, { pid: process.pid });
  } catch (error) {
    // The port is already bound; a lease that cannot be written must not leave a
    // server answering with no way for its caller to close it.
    await handle.close().catch(() => undefined);
    throw error;
  }
  const heldLease = lease;
  // `unref()`, so an idle heartbeat cannot be the reason the process stays
  // alive — the same rule the transport's session sweeper follows.
  let complained = false;
  const heartbeat = setInterval(() => {
    // A refresh that fails means the lease is gone or is now someone else's —
    // which is what a take-over does. Reporting it once matters, because
    // otherwise this process keeps dispatching into a log it no longer owns and
    // nothing anywhere says so.
    if (!refreshWriterLease(leasePath, heldLease.token) && !complained) {
      complained = true;
      console.error(
        `roomyx serve: this server no longer holds the writer lease for ${logPath}. ` +
          `Another writer took it over; stop dispatching into this room.`,
      );
      clearInterval(heartbeat);
    }
  }, LEASE_HEARTBEAT_MS);
  heartbeat.unref();

  return {
    ...handle,
    close: async () => {
      clearInterval(heartbeat);
      // Close first, release second: releasing while the server still answers
      // leaves a window where a live room looks like it has no writer.
      await handle.close();
      releaseWriterLease(leasePath, heldLease.token);
    },
  };
}
