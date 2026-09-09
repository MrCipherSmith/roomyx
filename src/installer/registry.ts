import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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

/** A lock older than this could only mean its holder crashed — the critical
 * sections here are a few synchronous file ops, never anywhere close to 30s. */
const STALE_LOCK_MS = 30_000;

/**
 * Blocks (synchronously) until an exclusive lockfile can be created, runs
 * `fn`, then always releases the lock. Reproduced concretely by an
 * independent review: without this, concurrent `roomyx serve` processes
 * lose registrations (read-modify-write race) and can crash each other with
 * a JSON parse error on a torn read of a non-atomic write. `Atomics.wait` is
 * used for the retry backoff because registerRoom/deregisterRoom are
 * synchronous APIs (matching how cli.ts already calls them) — an async lock
 * would leak into every caller's signature for no benefit here.
 *
 * A process that crashes mid-critical-section leaves the lockfile behind
 * forever — a second independent review caught that this would otherwise
 * block the registry permanently for every future caller, not just the one
 * racing the crash. A lock older than STALE_LOCK_MS is reclaimed instead of
 * waited on.
 *
 * The lockfile's content is an owner token (pid + random), not empty: a
 * third review caught that reclaiming by mtime alone is not enough — if the
 * original holder was merely slow (not crashed) and finishes after being
 * reclaimed, its unconditional release would delete whichever *other*
 * process's lock now legitimately occupies that path. Release only unlinks
 * when the file still holds the token this call itself wrote.
 */
/** Exported narrowly so the ownership check can be unit-tested directly,
 * without needing to choreograph real inter-process timing to hit it. */
export function releaseLockIfOwned(lockPath: string, token: string): void {
  try {
    if (readFileSync(lockPath, "utf8") === token) {
      unlinkSync(lockPath);
    }
  } catch {
    // Already gone, or unreadable — nothing more to do.
  }
}

function withLock<T>(registryPath: string, fn: () => T): T {
  const lockPath = `${registryPath}.lock`;
  const token = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      writeFileSync(lockPath, token, { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
          try {
            unlinkSync(lockPath);
          } catch {
            // Another process already reclaimed it first; just retry.
          }
          continue;
        }
      } catch {
        // Lock vanished between the failed open and this stat; retry.
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for the room registry lock at ${lockPath}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try {
    return fn();
  } finally {
    releaseLockIfOwned(lockPath, token);
  }
}

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
export async function listLiveRooms(registryPath: string): Promise<RoomRegistryEntry[]> {
  if (hasNoRegistry(registryPath)) return [];
  const rooms = withLock(registryPath, () => readRegistryUnlocked(registryPath).rooms);
  const checks = await Promise.all(
    rooms.map(async (room) => {
      const alive = await isRoomLive(room);
      return { room, alive };
    }),
  );
  const live = checks.filter((c) => c.alive).map((c) => c.room);
  if (live.length !== rooms.length) {
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

async function isRoomLive(room: RoomRegistryEntry, timeoutMs = 500): Promise<boolean> {
  const client = new Client({ name: "roomyx-registry-check", version: "0.1.0" });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("liveness check timed out")), timeoutMs);
  });
  try {
    await Promise.race([
      client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${room.port}/mcp`))),
      timeout,
    ]);
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}
