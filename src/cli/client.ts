import { CLIENT_FLAGS } from "./specs";
import type { Command } from "./shared";

export const clientCommand: Command = {
  usage: "roomyx client [flags]",
  summary: "attach the terminal UI (same as the roomyx-client binary)",
  flags: CLIENT_FLAGS,
  run: async ({ flags }) => {
    const { runClient } = await import("../client/index");
    await runClient(flags);
  },
};
