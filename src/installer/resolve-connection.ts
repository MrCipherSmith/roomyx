import { listLiveRooms, type RoomRegistryEntry } from "./registry";

export interface ResolveConnectionOptions {
  connect?: string;
  room?: string;
  registryPath: string;
}

export type ResolveConnectionResult =
  | { ok: true; url: string }
  | { ok: false; reason: "no-rooms" | "multiple-rooms" | "room-not-found"; candidates?: RoomRegistryEntry[] };

function urlFor(room: RoomRegistryEntry): string {
  return `http://127.0.0.1:${room.port}/mcp`;
}

/**
 * Decides which room-tui server `roomyx client` should connect to.
 * `--connect` always wins outright (explicit URL, registry not consulted).
 * `--room <id>` looks up that specific room among the LIVE ones (a
 * registered-but-dead id is treated the same as unknown, not a stale
 * false-positive). No args: auto-attach only when exactly one room is live.
 */
export async function resolveConnectionUrl(options: ResolveConnectionOptions): Promise<ResolveConnectionResult> {
  if (options.connect) {
    return { ok: true, url: options.connect };
  }

  const live = await listLiveRooms(options.registryPath);

  if (options.room) {
    const match = live.find((r) => r.id === options.room);
    return match ? { ok: true, url: urlFor(match) } : { ok: false, reason: "room-not-found" };
  }

  if (live.length === 0) return { ok: false, reason: "no-rooms" };
  if (live.length > 1) return { ok: false, reason: "multiple-rooms", candidates: live };
  return { ok: true, url: urlFor(live[0] as RoomRegistryEntry) };
}
