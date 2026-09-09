#!/usr/bin/env bun
import { serve } from "./server/serve";

/**
 * `roomyx serve <logPath> [--port N] [--host H] [--acknowledge-non-loopback]`
 * `roomyx client [--connect <url>]` is a separate entry point
 * (src/client/index.ts) — the orchestrator and the TUI are independent
 * processes by design (decisions.md D-06), so they are separate binaries,
 * not subcommands of one process that would tie their lifetimes together.
 */

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

async function main(): Promise<void> {
  const [command, logPath, ...rest] = process.argv.slice(2);

  if (command !== "serve") {
    console.error("Usage: bun src/cli.ts serve <logPath> [--port N] [--host H] [--acknowledge-non-loopback]");
    process.exit(1);
  }
  if (!logPath) {
    console.error("Missing <logPath>. Usage: bun src/cli.ts serve <logPath> [--port N]");
    process.exit(1);
  }

  const flags = parseFlags(rest);
  const handle = await serve(logPath, {
    port: flags.port !== undefined ? Number(flags.port) : undefined,
    host: typeof flags.host === "string" ? flags.host : undefined,
    acknowledgeNonLoopback: flags["acknowledge-non-loopback"] === true,
  });

  console.log(`roomyx serving ${logPath} at ${handle.url}`);

  const shutdown = () => {
    void handle.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
