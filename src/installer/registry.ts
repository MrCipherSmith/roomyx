import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withLock } from "../lockfile";
import { roomTransport } from "../room-token";
import { archiveRoom, defaultHistoryPath } from "./history";

/** Re-exported: the registry's own tests reach for it, and it lives in ../lockfile now. */
export { releaseLockIfOwned } from "../lockfile";

const registryEntrySchema = z.object({
  id: z.string().min(1),
  port: z.number().int().min(0),
  logPath: z.string().min(1),
  pid: z.number().int(),
  startedAt: z.string().min(1),
  /**
   * The room's per-room token, written here because this entry is already the
   * only place a room's port is recorded: whoever can find the port can find the
   * token, and nobody else has to be told twice.
   *
   * **Optional on read, required on write.** `registerRoom` always writes one —
   * the parameter type makes forgetting it a type error rather than a room
   * nothing can reach. But an entry left behind by a roomyx from before this
   * change has no token, and refusing to parse it would turn every `rooms list`
   * on an existing machine into "Invalid room registry" instead of a room that
   * answers 401. Reading permissively and failing at the door is the same shape
   * AC5 settled for the log: a stale record must not make the file unreadable.
   */
  token: z.string().min(1).optional(),
});

const registryFileSchema = z.object({
  schemaVersion: z.literal(1),
  rooms: z.array(registryEntrySchema),
});

export type RoomRegistryEntry = z.infer<typeof registryEntrySchema>;

/**
 * True when there is provably nothing to read: no registry file. Callers that
 * only read use this to skip the lock entirely, because taking the lock means
 * writing a lockfile NEXT TO the registry — which fails with ENOENT when the
 * directory itself doesn't exist yet. That is the shape of the bug this
 * guards: `readRegistryUnlocked` has always tolerated a missing registry, but
 * in an un-`init`ed project no caller ever reached it, because withLock threw
 * first. `roomyx rooms list` printed a bare ENOENT and `roomyx-client` printed
 * a stack trace, both for the ordinary case of "you haven't started a room".
 *
 * Racing a registerRoom that lands right after the check is harmless: the
 * reader returns the empty snapshot it would have returned a moment earlier.
 */
function hasNoRegistry(path: string): boolean {
  return !existsSync(path);
}

function readRegistryUnlocked(path: string): { schemaVersion: 1; rooms: RoomRegistryEntry[] } {
  if (!existsSync(path)) {
    return { schemaVersion: 1, rooms: [] };
  }
  const parsed = registryFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(`Invalid room registry at ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Write-to-temp-then-rename: a reader never observes a partially-written file.
 *
 * The file mode is left exactly as it was when this file held only ports —
 * `writeFileSync`'s default, so `0666 & ~umask`. That is a deliberate
 * non-change, not an oversight: the per-room token now lives here, and
 * tightening the mode in the same change that introduced it would be a second,
 * undiscussed decision riding along. It is recorded as a follow-up instead,
 * because it bears directly on how far the token reaches — see D-06b.
 */
function writeRegistryUnlocked(path: string, rooms: RoomRegistryEntry[]): void {
  const tmpPath = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmpPath, JSON.stringify({ schemaVersion: 1, rooms }, null, 2));
  renameSync(tmpPath, path);
}

function generateRoomId(): string {
  return `r-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Adds a new room to the registry, generating its id. Creates the registry's
 * directory if it isn't there: a write path has to be able to create its own
 * storage, or `roomyx serve` in an un-`init`ed project binds its port and only
 * then dies registering itself. This is not a back door around D-01's
 * explicit, never-clobbering `init` — it creates one empty directory, not the
 * config and staged skill that `init` scaffolds, and it clobbers nothing.
 */
export function registerRoom(
  registryPath: string,
  // `token` is required rather than optional, and that is the point of taking it
  // here at all: a registered room with no token is a room every in-tree client
  // resolves to and then cannot talk to, and the failure shows up as `unknown`
  // liveness rather than as an error. A required parameter makes the omission a
  // type error at the one call site that can make it.
  info: { port: number; logPath: string; pid: number; token: string },
): RoomRegistryEntry {
  mkdirSync(dirname(registryPath), { recursive: true });
  return withLock(registryPath, () => {
    const registry = readRegistryUnlocked(registryPath);
    const entry: RoomRegistryEntry = {
      id: generateRoomId(),
      port: info.port,
      logPath: info.logPath,
      pid: info.pid,
      startedAt: new Date().toISOString(),
      token: info.token,
    };
    writeRegistryUnlocked(registryPath, [...registry.rooms, entry]);
    return entry;
  });
}

/** Removes one room by id. No-op if the id — or the whole registry — isn't there. */
export function deregisterRoom(registryPath: string, id: string): void {
  if (hasNoRegistry(registryPath)) return;
  withLock(registryPath, () => {
    const registry = readRegistryUnlocked(registryPath);
    writeRegistryUnlocked(
      registryPath,
      registry.rooms.filter((r) => r.id !== id),
    );
  });
}

/** All registered rooms, live or not. Empty array if there is no registry yet. */
export function listRooms(registryPath: string): RoomRegistryEntry[] {
  if (hasNoRegistry(registryPath)) return [];
  return withLock(registryPath, () => readRegistryUnlocked(registryPath).rooms);
}

/**
 * Rooms confirmed live by an actual MCP round-trip (not just "the registry
 * says so" — a crashed process leaves a registry entry a dead port never
 * answers). Dead entries are pruned from the persisted file, not just
 * omitted from the returned list.
 */
/**
 * What a liveness probe established, which is not a yes/no.
 *
 * The defect this type replaces: `probeRoomState` returned `state | undefined`,
 * and `undefined` had to carry both "I could not reach it" and "the process is
 * gone". The caller resolved that ambiguity in the destructive direction —
 * `undefined → false → prune` — so a room that was merely slow had its registry
 * entry deleted and a history record written claiming it had ended. The 500 ms
 * probe is load-sensitive, `process.kill(pid, 0)` succeeds for a `SIGSTOP`ped
 * process, and the failure is silent: the room is serving, and the registry says
 * it never existed.
 *
 * R7's rule, in its own words: **identity mismatch is the one case where
 * deleting is correct — a timeout never is.** Three values is what makes that
 * expressible.
 */
export type Liveness = "live" | "gone" | "unknown";

/**
 * Asks what this entry is, with the destructive answer reserved for evidence.
 *
 * - `gone` — the registered pid is not running, or a server answered and named a
 *   different log than this entry claims. Both are facts about *this entry*.
 * - `unknown` — the probe did not reach it: a refused connection, a connect
 *   timeout, or a `tools/call` that did not answer in time. Nothing is known, so
 *   nothing may be deleted on the strength of it.
 * - `live` — a server answered and named this entry's log, or answered without a
 *   `log_path` at all. The second case is an older server: it cannot be shown to
 *   be a different room, and failing toward keeping is the safe direction, since
 *   the cost of wrongly pruning is higher than that of keeping a stale entry.
 *
 * **Known limit.** A pid that has been reused by an unrelated process keeps its
 * entry in `unknown` where it will stay until something answers on that port.
 * That is why the pid is a pre-filter and not the assertion — and it is strictly
 * better than deleting a live room, which is what the alternative buys.
 */
export async function checkRoomLiveness(room: RoomRegistryEntry, timeoutMs = 500): Promise<Liveness> {
  if (!isPidAlive(room.pid)) return "gone";
  const state = await probeRoomState(room, timeoutMs);
  if (state === undefined) return "unknown";
  if (state.log_path === undefined) return "live";
  return state.log_path === room.logPath ? "live" : "gone";
}

export interface LiveAndUnconfirmed {
  live: RoomRegistryEntry[];
  /**
   * Registered, probed, and not answered. Returned apart from `live` rather than
   * mixed in, because every consumer of the confirmed list decides *what to
   * attach to* — and a room that did not answer is not a candidate for that.
   */
  unconfirmed: RoomRegistryEntry[];
}

/**
 * The confirmed-live rooms, and the ones nothing is known about, as two lists.
 *
 * Only `gone` prunes and archives. A room pruned here died without
 * deregistering — crashed, or was killed with a signal no handler runs for — and
 * this is the only moment anything observes that it ended, so it is the only
 * place its history entry can be written. An `unknown` room gets neither: the
 * history line would be a claim it ended, and the prune would be a claim about
 * the room made on evidence that is a claim about the network.
 */
export async function listRoomsWithLiveness(
  registryPath: string,
  options: { prune?: boolean; historyPath?: string; timeoutMs?: number } = {},
): Promise<LiveAndUnconfirmed> {
  const prune = options.prune ?? true;
  const historyPath = options.historyPath ?? defaultHistoryPath(registryPath);
  if (hasNoRegistry(registryPath)) return { live: [], unconfirmed: [] };
  const rooms = withLock(registryPath, () => readRegistryUnlocked(registryPath).rooms);
  const checks = await Promise.all(
    rooms.map(async (room) => ({ room, liveness: await checkRoomLiveness(room, options.timeoutMs ?? 500) })),
  );
  const pick = (want: Liveness) => checks.filter((c) => c.liveness === want).map((c) => c.room);
  const live = pick("live");
  const unconfirmed = pick("unknown");
  const gone = pick("gone");

  // The MCP surface passes `prune: false`. It is the one place a network caller
  // could cause a filesystem write, and the content is not caller-controlled —
  // but "the MCP surface only reads" is worth being exactly true rather than
  // nearly, and the 500ms probe is load-sensitive enough that a busy machine
  // could prune a live-but-slow room on someone else's call.
  //
  // That reasoning is now structural rather than a convention: a load-sensitive
  // probe returns `unknown`, and `unknown` is not pruned even when pruning is
  // asked for. `prune: false` still matters — it stops the deletion of entries
  // confirmed gone — but the load-sensitive half of the argument no longer
  // depends on every caller remembering to pass it.
  if (prune && gone.length > 0) {
    // Re-take the lock for the write: another process may have registered or
    // deregistered a room while the (network) liveness checks above were in
    // flight. Re-read under the lock and only remove entries this pass
    // actually confirmed gone, instead of blindly overwriting with the stale
    // list computed before the re-read.
    withLock(registryPath, () => {
      const current = readRegistryUnlocked(registryPath).rooms;
      const goneIds = new Set(gone.map((r) => r.id));
      writeRegistryUnlocked(
        registryPath,
        current.filter((r) => !goneIds.has(r.id)),
      );
    });
    // `closedAt` is now, not the moment it actually died, which is unknowable
    // — the entry records when it was found gone.
    for (const room of gone) archiveRoom(historyPath, room);
  }
  return { live, unconfirmed };
}

/**
 * The registered entry serving a log, whether or not it was confirmed live.
 *
 * For anything that must know *which room is this*, rather than *may I attach to
 * it*. The distinction matters here because a first probe can time out while the
 * room is alive: searching only the confirmed list made a slow machine's answer
 * to "is anyone writing into this log?" come back "nothing is" — which is the
 * same collapsed question this module's `Liveness` type was introduced to stop
 * asking. An unconfirmed entry is still an entry, and its second probe may
 * answer.
 */
export function findRoomServing(
  logPath: string,
  lists: { live: RoomRegistryEntry[]; unconfirmed: RoomRegistryEntry[] },
): RoomRegistryEntry | undefined {
  return [...lists.live, ...lists.unconfirmed].find((room) => room.logPath === logPath);
}

/** Confirmed live only — what anything that decides what to attach to must read. */
export async function listLiveRooms(
  registryPath: string,
  options: { prune?: boolean; historyPath?: string; timeoutMs?: number } = {},
): Promise<RoomRegistryEntry[]> {
  return (await listRoomsWithLiveness(registryPath, options)).live;
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true; // no pid recorded — fall back to the probe
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/**
 * Asks a registered room what it is, or `undefined` when nothing answers.
 *
 * Extracted from `isRoomLive` so the CLI can reach the same answer for the same
 * reason: whether a room is live and whether anything is *writing* into it come
 * from one reply, and two probes could disagree.
 */
/**
 * The loopback address this probe dials.
 *
 * Assembled from its octets rather than written as a literal on purpose. Text
 * that passes through this repository's tooling has IP literals replaced with a
 * redaction marker, and a marker written into a source file is a syntax-level
 * runtime failure — `new URL()` throws — that no unit test catches, because the
 * tests build their URLs from the same constant. It cost one debugging round to
 * find; it costs nothing to avoid.
 */
const LOOPBACK_HOST = [127, 0, 0, 1].join(".");

export async function probeRoomState(
  room: RoomRegistryEntry,
  timeoutMs = 500,
): Promise<{ log_path?: string; dispatcherAttached?: boolean } | undefined> {
  if (!isPidAlive(room.pid)) return undefined;
  const client = new Client({ name: "roomyx-registry-check", version: "0.1.0" });
  // Through `roomTransport`, with the token off the entry being probed. This is
  // the call site D-06a's precedent points at: the probe is the only in-tree
  // caller whose failure is silent, because a refused probe is reported as
  // `unknown` liveness and `unknown` is an ordinary answer. A hand-assembled
  // header here that drifted from the server's expectation would read as a busy
  // machine, not as a bug.
  const transport = roomTransport(`http://${LOOPBACK_HOST}:${room.port}/mcp`, room.token);
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("liveness check timed out")), timeoutMs);
  });
  try {
    await Promise.race([client.connect(transport), timeout]);
    const result = await Promise.race([client.callTool({ name: "room.get_state", arguments: {} }), timeout]);
    const content = result.content as Array<{ type: string; text: string }> | undefined;
    const text = content?.[0]?.text;
    if (text === undefined) return undefined;
    return JSON.parse(text) as { log_path?: string; dispatcherAttached?: boolean };
  } catch {
    return undefined;
  } finally {
    await transport.terminateSession().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}

