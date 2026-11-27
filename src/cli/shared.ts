import { join } from "node:path";
import { createServerShutdown } from "../server/shutdown";
import { findRoomServing, listRoomsWithLiveness } from "../installer/registry";
import { ArgError } from "./args";
import type { FlagSpecs, ParsedArgs } from "./args";

export function defaultRegistryPath(): string {
  return join(process.cwd(), ".roomyx", "rooms", "registry.json");
}

export function defaultConfigPath(): string {
  return join(process.cwd(), ".roomyx", "config.json");
}

export function bundledSkillPath(): string {
  return join(import.meta.dir, "..", "bundled-skills", "startup-room", "SKILL.md");
}

export function bundledPersonasPath(): string {
  return join(import.meta.dir, "..", "bundled-personas");
}

export const REGISTRY_FLAG = { type: "string", describe: "Registry file (default .roomyx/rooms/registry.json)" } as const;

/**
 * Wires the signals. The shutdown itself lives in `../server/shutdown`, where a
 * test can reach it — this module runs its entry point on import.
 *
 * Written once because there were three copies and they had drifted: the two
 * here handled SIGINT and SIGTERM and guarded nothing, while the client handled
 * SIGHUP as well and guarded re-entry. So closing a terminal (SIGHUP) killed
 * `roomyx serve` outright, skipping deregistration and leaving a stale registry
 * entry — which a recycled port then resurrects as a live room.
 *
 * `cleanup` runs *after* the close resolves, not before. Deregistering first
 * meant a shutdown that hung — and it hung whenever a client was attached —
 * removed the room from the registry while the process kept running and kept
 * the port. The room became invisible while still being served.
 */
export function runUntilSignal(close: () => Promise<void>, cleanup: () => void = () => undefined): void {
  const shutdown = createServerShutdown(close, cleanup);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, shutdown);
}

export interface Command {
  usage: string;
  summary: string;
  /** Extra lines under the flag table. */
  notes?: string;
  flags: FlagSpecs;
  run: (args: ParsedArgs) => Promise<void>;
}

/**
 * The live room serving this log, or a refusal that says what to do.
 *
 * Shared by the three commands that talk to a room's own MCP server. They need
 * a port, and the registry is the only place a room's port is written down —
 * which is exactly why these tools had no caller before: there is no way to
 * reach a room without going through here first.
 */
export async function servingRoomFor(absoluteLog: string, registryPath: string) {
  const serving = findRoomServing(absoluteLog, await listRoomsWithLiveness(registryPath, { prune: false }));
  if (serving === undefined) {
    throw new ArgError(
      `No live room is serving ${absoluteLog}. These commands read from the room's own server, ` +
        `so the room has to be running: start it with \`roomyx serve ${absoluteLog} --port 0\`.`,
    );
  }
  return serving;
}
