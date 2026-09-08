#!/usr/bin/env bun
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import type { GoalContract, MessageEnvelope, RosterEntry } from "../log/types";

/**
 * Manual-testing helper: initializes a room log with a state header, or
 * appends one message to an existing log. Not part of the MCP server itself
 * (D-01 in docs/requirements/room-tui/decisions.md — only the dispatcher
 * writes the real log; this is a standalone fixture-seeding tool for local
 * development, not a live dispatcher integration).
 *
 * Usage:
 *   bun src/cli/seed.ts init <path> --goal "<goal_statement>" --roster id1:Name1,id2:Name2
 *   bun src/cli/seed.ts append <path> --from <id> --body "<text>" [--kind pitch] [--in-reply-to N]
 */

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--")) {
      flags[arg.slice(2)] = args[i + 1] ?? "";
      i++;
    }
  }
  return flags;
}

function nextSeq(path: string): number {
  if (!existsSync(path)) return 1;
  const lines = require("node:fs")
    .readFileSync(path, "utf8")
    .split("\n")
    .filter((l: string) => l.trim().length > 0);
  const messageSeqs = lines
    .slice(1)
    .map((l: string) => (JSON.parse(l) as { seq: number }).seq);
  return messageSeqs.length > 0 ? Math.max(...messageSeqs) + 1 : 1;
}

const [command, path, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);

if (command === "init" && path) {
  const roster: RosterEntry[] = (flags.roster ?? "")
    .split(",")
    .filter(Boolean)
    .map((pair) => {
      const [id, name] = pair.split(":");
      return { id: id ?? "", name: name ?? id ?? "" };
    });
  const goalContract: GoalContract = {
    version: 1,
    goal_statement: flags.goal ?? "Untitled room",
    criteria: flags.criteria ?? "",
    threshold: { fail_below: 60, pass_at_or_above: 80 },
  };
  writeFileSync(path, JSON.stringify({ type: "state", goal_contract: goalContract, roster }) + "\n");
  console.log(`Initialized ${path} with ${roster.length} roster entries.`);
} else if (command === "append" && path) {
  const message: MessageEnvelope & { type: "message" } = {
    type: "message",
    seq: nextSeq(path),
    from: flags.from ?? "unknown",
    body: flags.body ?? "",
    ...(flags.kind ? { kind: flags.kind as MessageEnvelope["kind"] } : {}),
    ...(flags["in-reply-to"] ? { in_reply_to: Number(flags["in-reply-to"]) } : {}),
  };
  appendFileSync(path, JSON.stringify(message) + "\n");
  console.log(`Appended seq ${message.seq} from ${message.from} to ${path}.`);
} else {
  console.error("Usage: bun src/cli/seed.ts init|append <path> [--flags...]");
  process.exit(1);
}
