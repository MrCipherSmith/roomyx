import { createRoomMcpServer } from "./index";
import { OwnerCommandQueue } from "./owner-queue";
import type { RoomMcpServerOptions } from "./index";
import { serveMcpOverHttp } from "./http-transport";
import type { McpHttpTransportHandle } from "./http-transport";
import { loadRoomLog } from "../log/store";
import {
  LEASE_HEARTBEAT_MS,
  acquireWriterLease,
  releaseWriterLease,
  renewWriterLease,
} from "../writer-lease";
import type { WriterLease } from "../writer-lease";

export interface ServeOptions extends RoomMcpServerOptions {
  /** Defaults to 4319 (specification.md's default). 0 selects an ephemeral port. */
  port?: number;
  host?: string;
  acknowledgeNonLoopback?: boolean;
  /**
   * Where the writer lease lives, when this server has a dispatcher attached.
   * Defaults to none: an embedder that does not dispatch holds nothing, and a
   * library caller should not acquire a lease as a side effect of binding.
   *
   * Passing it means accepting the consequence: if another writer takes this
   * room over, this server **closes itself** rather than keep dispatching into a
   * log it no longer owns. `close()` stays safe to call afterwards.
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

  // ONE queue for the room, created here because this factory runs once per
  // SESSION: state built inside it would belong to a single client, so a command
  // posted by the TUI would be invisible to the dispatcher's own session. This is
  // the difference between a feature and a feature that passes its tests.
  const ownerQueue = new OwnerCommandQueue();

  const handle = await serveMcpOverHttp({
    createMcpServer: () =>
      createRoomMcpServer(logPath, { onOwnerCommand: options.onOwnerCommand, ownerQueue }),
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
  let lease: WriterLease;
  try {
    lease = acquireWriterLease(leasePath, { pid: process.pid });
  } catch (error) {
    // The port is already bound; a lease that cannot be written must not leave a
    // server answering with no way for its caller to close it.
    await handle.close().catch(() => undefined);
    throw error;
  }
  // The token changes when the heartbeat has to re-acquire a lease that expired
  // under it, so what this process holds is a variable, not the value it started
  // with. Releasing the original token after a re-acquire would leave the current
  // one behind — the exact class of bug the owner-token rule exists to prevent.
  let heldToken = lease.token;

  // One close path, however it is reached. `httpServer.close()` rejects on a
  // server that is already closed, so a displacement that closes the room and an
  // embedder that then calls `close()` itself must not be two closes.
  let closing: Promise<void> | undefined;
  const closeOnce = async (): Promise<void> => {
    closing ??= (async () => {
      clearInterval(heartbeat);
      // Close first, release second: releasing while the server still answers
      // leaves a window where a live room looks like it has no writer.
      await handle.close();
      releaseWriterLease(leasePath, heldToken);
    })();
    return closing;
  };

  // `unref()`, so an idle heartbeat cannot be the reason the process stays
  // alive — the same rule the transport's session sweeper follows.
  let reportedStall = false;
  const heartbeat: NodeJS.Timeout = setInterval(() => {
    const renewal = renewWriterLease(leasePath, heldToken, { pid: process.pid });

    if (renewal.outcome === "refreshed") return;

    if (renewal.outcome === "reacquired") {
      // We fell behind — suspended machine, stopped container, a long pause —
      // and nobody took the room while we were away. This used to be reported as
      // a take-over and then `clearInterval`'d, so a server that was still the
      // only writer stopped refreshing for good and its room became
      // take-over-able while it was writing. Re-arm and keep going; the
      // heartbeat's job is to state that we are here, and we are.
      heldToken = renewal.lease.token;
      if (!reportedStall) {
        reportedStall = true;
        console.error(
          `roomyx serve: the writer lease for ${logPath} expired while this server was not refreshing it ` +
            `(${Math.round(renewal.staleFor / 1000)}s without a heartbeat) and has been re-acquired. ` +
            `Nobody else had claimed it.`,
        );
      }
      return;
    }

    // Displaced, for real: the record on disk belongs to another token. Advice
    // was all this used to do, and advice is enforced by nothing — the process
    // went on dispatching into a log it no longer owned. D-01 allows one writer
    // per live room, so the one that lost the lease stops being a room: the
    // transport closes, and the dispatcher's next call fails loudly instead of
    // succeeding into a conversation someone else now owns.
    console.error(
      `roomyx serve: this server no longer holds the writer lease for ${logPath} — pid ${renewal.by.pid} holds it ` +
        `now${renewal.by.takenOverFrom === undefined ? "" : ` (taken over from pid ${renewal.by.takenOverFrom.pid})`}. ` +
        `Two writers into one append-only log is the race D-01 prevents, so this server is shutting down; stop ` +
        `dispatching into this room.`,
    );
    // The lease is not ours, so there is nothing of ours to release: `closeOnce`
    // checks the token before unlinking, which is what makes that safe.
    void closeOnce().catch((error: unknown) => {
      console.error(`roomyx serve: closing after losing the writer lease failed: ${String(error)}`);
    });
  }, LEASE_HEARTBEAT_MS);
  heartbeat.unref();

  return { ...handle, close: closeOnce };
}
