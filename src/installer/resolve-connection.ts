import { listLiveRooms, listRooms, type RoomRegistryEntry } from "./registry";

export interface ResolveConnectionOptions {
  connect?: string;
  room?: string;
  registryPath: string;
  /**
   * An explicitly supplied per-room token, for the one case the registry cannot
   * answer: `--connect` naming a room on another machine, or one this machine
   * never registered. It wins over anything found in the registry.
   */
  token?: string;
}

export type ResolveConnectionResult =
  | { ok: true; url: string; token?: string }
  | { ok: false; reason: "no-rooms" | "multiple-rooms" | "room-not-found"; candidates?: RoomRegistryEntry[] };

function urlFor(room: RoomRegistryEntry): string {
  return `http://127.0.0.1:${room.port}/mcp`;
}

/**
 * The token for an explicitly-given URL, found by its port.
 *
 * `--connect` is documented as "the registry is not consulted", and the URL is
 * still not looked up — it is used exactly as given. What is looked up is the
 * *credential* for a port the caller has already named, which is the ordinary
 * case: someone who read a port out of `rooms list` and pasted it. Without this,
 * `--connect` would be the one client path the token silently broke, and its
 * symptom would be a client retrying against a room that is running.
 *
 * `listRooms`, not `listLiveRooms`: no liveness probe. A probe here would be a
 * round trip the flag exists to skip, and the answer is wanted whether or not the
 * room has answered yet.
 */
function tokenForUrl(connect: string, registryPath: string): string | undefined {
  let port: string;
  try {
    port = new URL(connect).port;
  } catch {
    // Not a URL we can read. The transport will say so in its own words; there
    // is nothing to look up.
    return undefined;
  }
  if (port === "") return undefined;
  return listRooms(registryPath).find((room) => String(room.port) === port)?.token;
}

/**
 * Decides which roomyx server `roomyx-client` should connect to, and with which
 * token.
 *
 * `--connect` always wins outright for the *address* (explicit URL, never
 * looked up). `--room <id>` looks up that specific room among the LIVE ones (a
 * registered-but-dead id is treated the same as unknown, not a stale
 * false-positive). No args: auto-attach only when exactly one room is live.
 *
 * The token travels with the URL rather than being resolved separately by the
 * caller, because "which room" and "the credential for that room" are one
 * answer: a caller that could get one without the other is a caller that can
 * connect to a room it cannot talk to.
 */
export async function resolveConnectionUrl(options: ResolveConnectionOptions): Promise<ResolveConnectionResult> {
  if (options.connect) {
    const token = options.token ?? tokenForUrl(options.connect, options.registryPath);
    return { ok: true, url: options.connect, ...(token === undefined ? {} : { token }) };
  }

  const live = await listLiveRooms(options.registryPath);

  const found = (room: RoomRegistryEntry): ResolveConnectionResult => {
    const token = options.token ?? room.token;
    return { ok: true, url: urlFor(room), ...(token === undefined ? {} : { token }) };
  };

  if (options.room) {
    const match = live.find((r) => r.id === options.room);
    return match ? found(match) : { ok: false, reason: "room-not-found" };
  }

  if (live.length === 0) return { ok: false, reason: "no-rooms" };
  if (live.length > 1) return { ok: false, reason: "multiple-rooms", candidates: live };
  return found(live[0] as RoomRegistryEntry);
}
