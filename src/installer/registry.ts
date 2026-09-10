import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { withLock } from "../lockfile";

/** Re-exported: the registry's own tests reach for it, and it lives in ../lockfile now. */
export { releaseLockIfOwned } from "../lockfile";

const registryEntrySchema = z.object({
  id: z.string().min(1),
  port: z.number().int().min(0),
  logPath: z.string().min(1),
  pid: z.number().int(),
  startedAt: z.string().min(1),
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

/** Write-to-temp-then-rename: a reader never observes a partially-written file. */
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
  info: { port: number; logPath: string; pid: number },
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
export async function listLiveRooms(
  registryPath: string,
  options: { prune?: boolean } = {},
): Promise<RoomRegistryEntry[]> {
  const prune = options.prune ?? true;
  if (hasNoRegistry(registryPath)) return [];
  const rooms = withLock(registryPath, () => readRegistryUnlocked(registryPath).rooms);
  const checks = await Promise.all(
    rooms.map(async (room) => {
      const alive = await isRoomLive(room);
      return { room, alive };
    }),
  );
  const live = checks.filter((c) => c.alive).map((c) => c.room);
  // The MCP surface passes `prune: false`. It is the one place a network caller
  // could cause a filesystem write, and the content is not caller-controlled —
  // but "the MCP surface only reads" is worth being exactly true rather than
  // nearly, and the 500ms probe is load-sensitive enough that a busy machine
  // could prune a live-but-slow room on someone else's call.
  if (prune && live.length !== rooms.length) {
    // Re-take the lock for the write: another process may have registered or
    // deregistered a room while the (network) liveness checks above were in
    // flight. Re-read under the lock and only remove entries this pass
    // actually confirmed dead, instead of blindly overwriting with the
    // stale `live` list computed before the re-read.
    withLock(registryPath, () => {
      const current = readRegistryUnlocked(registryPath).rooms;
      const deadIds = new Set(checks.filter((c) => !c.alive).map((c) => c.room.id));
      writeRegistryUnlocked(
        registryPath,
        current.filter((r) => !deadIds.has(r.id)),
      );
    });
  }
  return live;
}

/**
 * Is the process that registered this room still running?
 *
 * Signal 0 performs the permission and existence checks without delivering
 * anything. ESRCH means no such process; EPERM means it exists and belongs to
 * someone else, which is still "alive" for our purposes.
 */
function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true; // no pid recorded — fall back to the probe
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function isRoomLive(room: RoomRegistryEntry, timeoutMs = 500): Promise<boolean> {
  // The probe below proves that *something* MCP-speaking answers on that port,
  // never that it is this room. Every `roomyx serve` defaults to 4319, so a
  // room that died without deregistering was resurrected as live by the next
  // room to bind the port — and then `roomyx-client --room <dead-id>` silently
  // rendered a different room's transcript under the dead room's id, while
  // `room append` refused a log nothing was serving.
  //
  // The pid has been in the registry all along and was never read. Checking it
  // first also skips a 500 ms network probe per dead entry.
  if (!isPidAlive(room.pid)) return false;

  const client = new Client({ name: "roomyx-registry-check", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${room.port}/mcp`));
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("liveness check timed out")), timeoutMs);
  });
  try {
    await Promise.race([client.connect(transport), timeout]);
    // Connecting proves something MCP-speaking answers on that port. Asking it
    // which log it serves is what proves it is *this* room — the pid check
    // above narrows the window and does not close it, because a pid can be
    // recycled and every serve defaults to the same port.
    const result = await Promise.race([client.callTool({ name: "room.get_state", arguments: {} }), timeout]);
    const content = result.content as Array<{ type: string; text: string }> | undefined;
    const text = content?.[0]?.text;
    if (text === undefined) return false;
    const state = JSON.parse(text) as { log_path?: string };
    // An older server that predates `log_path` answers without it. Treat that
    // as "cannot be shown to be a different room" rather than as dead: failing
    // toward the previous behaviour is the safe direction here, because the
    // cost of wrongly pruning a live room is higher than of keeping a stale one.
    return state.log_path === undefined || state.log_path === room.logPath;
  } catch {
    return false;
  } finally {
    // This probe runs for every registered room on every `rooms list`, every
    // `room append` and every client start. Closing without terminating left
    // one abandoned server-side session behind each time.
    await transport.terminateSession().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}
