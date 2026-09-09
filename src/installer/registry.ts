import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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
 */
function withLock<T>(registryPath: string, fn: () => T): T {
  const lockPath = `${registryPath}.lock`;
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      closeSync(openSync(lockPath, "wx"));
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
    try {
      unlinkSync(lockPath);
    } catch {
      // Already gone; nothing to clean up.
    }
  }
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

/** Adds a new room to the registry, generating its id. */
export function registerRoom(
  registryPath: string,
  info: { port: number; logPath: string; pid: number },
): RoomRegistryEntry {
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

/** Removes one room by id. No-op if the id isn't present. */
export function deregisterRoom(registryPath: string, id: string): void {
  withLock(registryPath, () => {
    const registry = readRegistryUnlocked(registryPath);
    writeRegistryUnlocked(
      registryPath,
      registry.rooms.filter((r) => r.id !== id),
    );
  });
}

/** All registered rooms, live or not. Empty array if the file doesn't exist. */
export function listRooms(registryPath: string): RoomRegistryEntry[] {
  return withLock(registryPath, () => readRegistryUnlocked(registryPath).rooms);
}

/**
 * Rooms confirmed live by an actual MCP round-trip (not just "the registry
 * says so" — a crashed process leaves a registry entry a dead port never
 * answers). Dead entries are pruned from the persisted file, not just
 * omitted from the returned list.
 */
export async function listLiveRooms(registryPath: string): Promise<RoomRegistryEntry[]> {
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
