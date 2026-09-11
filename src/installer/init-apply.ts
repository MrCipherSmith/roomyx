import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { join } from "node:path";
import { syncSkillBundle } from "./skill-sync";
import { installPersonas } from "./personas";
import type { PlanItem } from "./init-plan";

/**
 * Performs a plan the operator has ticked. One result line per item, whether it
 * worked or not — a run that half-succeeded must say which half.
 *
 * Every write here is additive or backed up. Nothing this function does removes
 * an existing line, key or file.
 */

export interface ApplyResult {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly ok: boolean;
  /** What happened, in one line, for the summary the CLI prints. */
  readonly message: string;
}

export interface ApplyContext {
  cwd: string;
  bundledSkillPath: string;
  bundledPersonasPath: string;
  configPath: string;
}

export function applyPlan(items: readonly PlanItem[], context: ApplyContext): ApplyResult[] {
  return items.map((item) => {
    try {
      return { id: item.id, label: item.label, path: item.path, ok: true, message: applyOne(item, context) };
    } catch (error) {
      // One failing item must not abort the rest: a `~/.cursor` that is not
      // writable should not cost the operator the Claude install they also
      // asked for in the same submit.
      return {
        id: item.id,
        label: item.label,
        path: item.path,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

function applyOne(item: PlanItem, context: ApplyContext): string {
  switch (item.kind) {
    case "skill": {
      const result = syncSkillBundle({
        bundledSkillPath: context.bundledSkillPath,
        targetPath: item.path,
        configPath: context.configPath,
        dryRun: false,
        // The operator ticked this box and pressed Enter. That is what `--yes`
        // means on the command line, and it is a stronger signal than a flag:
        // they saw the exact path before agreeing to it.
        yes: true,
      });
      if (result.upToDate) return "already in sync";
      if (!result.written) return result.warnings[0] ?? "not written";
      return result.backedUpTo ? `written (backup: ${result.backedUpTo})` : "written";
    }

    case "personas": {
      const result = installPersonas(context.bundledPersonasPath, item.path);
      if (result.written === 0) return `${result.skipped} file(s) already there — none replaced`;
      return result.skipped === 0
        ? `${result.written} file(s) written`
        : `${result.written} written, ${result.skipped} kept as they were`;
    }

    case "logs":
      mkdirSync(item.path, { recursive: true });
      return "created";

    case "gitignore":
      return ensureGitignore(context.cwd);

    case "mcp":
      return ensureMcpServer(item.path, item.id === "mcp:cursor");
  }
}

const IGNORE_LINES = [".roomyx/rooms/registry.json", ".roomyx/rooms/*.lock"];

/**
 * Appends the two machine-local paths to `.gitignore` if they are not already
 * covered, and leaves everything else in the file alone.
 *
 * Room logs are deliberately not ignored. The transcript is the artefact worth
 * keeping; what is machine-local is the registry (pids and ports of processes
 * on this host) and the transient lockfiles.
 */
function ensureGitignore(cwd: string): string {
  const path = join(cwd, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const present = new Set(existing.split("\n").map((line) => line.trim()));
  const missing = IGNORE_LINES.filter((line) => !present.has(line));
  if (missing.length === 0) return "already covered";

  const block = `${existing.length > 0 && !existing.endsWith("\n") ? "\n" : ""}\n# roomyx — machine-local state (room logs are NOT ignored)\n${missing.join("\n")}\n`;
  writeFileSync(path, existing + block, "utf8");
  return `added ${missing.length} line(s)`;
}

interface McpConfig {
  mcpServers?: Record<string, unknown>;
}

/**
 * Adds a `roomyx` entry to an MCP config, merging rather than replacing.
 *
 * The entry spawns `roomyx mcp --stdio`, not an HTTP URL. A URL would have to
 * name a port that something is already listening on, so a registration written
 * at `init` would point at nothing until the operator remembered to start a
 * server — a config entry that is broken by default. Over stdio the client
 * starts it when it needs it and there is no port at all.
 *
 * An existing `roomyx` key is left untouched: the operator may have pointed it
 * somewhere deliberately, and silently rewriting someone's MCP config is the
 * same class of theft D-02 exists to prevent.
 */
function ensureMcpServer(path: string, createDir: boolean): string {
  if (createDir) mkdirSync(dirname(path), { recursive: true });

  let config: McpConfig = {};
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8").trim();
    if (text !== "") {
      try {
        config = JSON.parse(text) as McpConfig;
      } catch (error) {
        // Refused rather than overwritten. A file we cannot parse may still be
        // a file someone is relying on.
        throw new Error(
          `${path} is not valid JSON — ${error instanceof Error ? error.message : String(error)}. Left untouched.`,
        );
      }
    }
  }

  const servers = config.mcpServers ?? {};
  if (servers.roomyx !== undefined) return "already registered — left as it is";

  config.mcpServers = { ...servers, roomyx: { command: "roomyx", args: ["mcp", "--stdio"] } };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return "registered";
}
