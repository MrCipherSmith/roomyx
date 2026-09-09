/**
 * One argument grammar for the whole CLI.
 *
 * There were two hand-rolled scanners with different semantics, and between
 * them they produced this, measured against the published 0.4.0:
 *
 *   roomyx serve --port 0 room.jsonl   → served a file literally named "--port"
 *   roomyx serve --help                → STARTED A SERVER
 *   roomyx serve room.jsonl --port     → port 1, because Number(true) === 1
 *   roomyx serve room.jsonl --port abc → NaN, so a silent ephemeral port
 *   roomyx skills sync --dryrun        → unknown flag, silently ignored
 *   roomyx --help                      → usage on stderr, exit 1
 *
 * Every one of those is the same defect: a scanner that never decided what a
 * flag *is*, so it could not tell a value from a positional, a typo from an
 * option, or a number from a boolean. Declaring the flags fixes the whole
 * class, which is why this is a spec-driven parser rather than six patches.
 *
 * It matters beyond tidiness because an agent is a first-class user of this
 * CLI, and the first thing an agent does with an unknown command is ask for
 * `--help`.
 */

export type FlagType = "string" | "number" | "boolean";

export interface FlagSpec {
  type: FlagType;
  describe: string;
}

export type FlagSpecs = Record<string, FlagSpec>;

export type FlagValues = Record<string, string | number | boolean>;

export interface ParsedArgs {
  positionals: string[];
  flags: FlagValues;
  /** True when `--help`/`-h` appeared. Callers print help and exit 0. */
  help: boolean;
}

/** Thrown for anything the caller should report and exit 1 on. */
export class ArgError extends Error {}

/** Levenshtein, for "unknown flag --dryrun; did you mean --dry-run?". */
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const substitution = rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      rows[i]![j] = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, substitution);
    }
  }
  return rows[a.length]![b.length]!;
}

function suggest(unknown: string, known: string[]): string | undefined {
  let best: { name: string; d: number } | undefined;
  for (const name of known) {
    const d = distance(unknown, name);
    if (!best || d < best.d) best = { name, d };
  }
  // Two edits is close enough to be a typo and far enough not to be noise.
  return best && best.d <= 2 ? best.name : undefined;
}

export function parseArgs(argv: string[], specs: FlagSpecs): ParsedArgs {
  const positionals: string[] = [];
  const flags: FlagValues = {};
  const known = Object.keys(specs);
  let help = false;
  let sawTerminator = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;

    if (sawTerminator || !arg.startsWith("--")) {
      if (arg === "-h" && !sawTerminator) {
        help = true;
        continue;
      }
      positionals.push(arg);
      continue;
    }

    if (arg === "--") {
      sawTerminator = true;
      continue;
    }

    const eq = arg.indexOf("=");
    const name = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).trim();
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);

    if (name === "help") {
      help = true;
      continue;
    }

    const spec = specs[name];
    if (!spec) {
      const hint = suggest(name, known);
      throw new ArgError(
        `Unknown flag --${name}${hint ? `. Did you mean --${hint}?` : "."}` +
          (known.length > 0 ? `\nKnown flags: ${known.map((f) => `--${f}`).join(", ")}` : ""),
      );
    }

    if (spec.type === "boolean") {
      if (inlineValue !== undefined && inlineValue !== "true" && inlineValue !== "false") {
        throw new ArgError(`--${name} is a switch and takes no value (got "${inlineValue}").`);
      }
      flags[name] = inlineValue !== "false";
      continue;
    }

    // A value is required, and the next argv entry is only a value if it does
    // not look like a flag. `--port --host x` must fail rather than quietly
    // read `--host` as the port.
    let raw = inlineValue;
    if (raw === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new ArgError(`--${name} needs a value.`);
      }
      raw = next;
      i++;
    }
    if (raw === "") {
      throw new ArgError(`--${name} needs a value.`);
    }

    if (spec.type === "number") {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new ArgError(`--${name} needs a number (got "${raw}").`);
      }
      flags[name] = value;
      continue;
    }

    flags[name] = raw;
  }

  return { positionals, flags, help };
}

/** Renders a spec as the flag table a `--help` prints. */
export function renderFlags(specs: FlagSpecs): string {
  const names = Object.keys(specs);
  if (names.length === 0) return "";
  const width = Math.max(...names.map((n) => n.length));
  return names.map((n) => `  --${n.padEnd(width)}  ${specs[n]!.describe}`).join("\n");
}
