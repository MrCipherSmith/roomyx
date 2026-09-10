import type { FlagSpecs } from "./args";

/**
 * The client's flags, in one place because two entry points take them: the
 * `roomyx-client` binary and `roomyx client`. They were two hand-rolled
 * scanners with different semantics, which is how a bare `--registry` came to
 * resolve to the empty string in one of them and to `true` in the other.
 *
 * This module deliberately imports nothing but a type, so `roomyx --version`
 * does not pay for loading the TUI renderer.
 */
export const CLIENT_FLAGS: FlagSpecs = {
  room: { type: "string", describe: "Attach to a specific live room by id" },
  connect: { type: "string", describe: "Attach to an explicit MCP URL; the registry is not consulted" },
  registry: { type: "string", describe: "Registry file (default .roomyx/rooms/registry.json)" },
  open: { type: "string", describe: "Reread a closed room from its log file, read-only" },
  archive: { type: "boolean", describe: "Pick a closed room from the history index" },
};
