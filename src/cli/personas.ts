import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { installPersonas } from "../installer/personas";
import { ArgError } from "./args";
import { bundledPersonasPath } from "./shared";
import type { Command } from "./shared";

function defaultPersonasPath(cwd: string = process.cwd()): string {
  return join(cwd, ".roomyx", "personas");
}

export const personasCommand: Command = {
  usage: "roomyx personas [flags]",
  summary: "install the bundled persona library into this project",
  notes:
    "Fifty interview personas, plus founder, technical and panel roles, plus\n  a fifty-question interview questionnaire. A room is built out of these.\n\n  The skill looks in .roomyx/personas first and falls back to\n  ~/.roomyx/personas, so a project copy overrides the machine-wide one.\n\n  Files that already exist are skipped, never overwritten: a persona is a\n  file you are meant to edit.",
  flags: {
    target: { type: "string", describe: "Directory (default .roomyx/personas)" },
    global: { type: "boolean", describe: "Install for every project, into ~/.roomyx/personas" },
    force: { type: "boolean", describe: "Replace the library, moving the existing directory aside first" },
  },
  run: async ({ flags }) => {
    if (typeof flags.target === "string" && flags.global === true) {
      throw new ArgError("Pass either --target or --global, not both — they name different directories.");
    }
    const target =
      typeof flags.target === "string"
        ? resolve(flags.target)
        : flags.global === true
          ? join(homedir(), ".roomyx", "personas")
          : defaultPersonasPath();
    const result = installPersonas(bundledPersonasPath(), target, { force: flags.force === true });

    if (result.movedAside) console.log(`Moved the previous library to ${result.movedAside}`);
    console.log(`${result.written} file(s) written to ${result.targetDir}`);
    if (result.skipped > 0) {
      console.log(`${result.skipped} left as they were (already present — pass --force to replace the library)`);
    }
  },
};
