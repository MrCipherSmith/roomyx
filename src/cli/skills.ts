import { existsSync } from "node:fs";
import { syncSkillBundle } from "../installer/skill-sync";
import { NAMED_TARGETS, resolveTargets } from "../installer/skill-targets";
import { ArgError } from "./args";
import { bundledSkillPath, defaultConfigPath } from "./shared";
import type { Command } from "./shared";

export const skillsSync: Command = {
  usage: "roomyx skills sync --target <runtime|all|path> [flags]",
  summary: "install the bundled startup-room skill",
  notes:
    "Without --yes nothing is written: the run reports what it would do and\n  stops. D-02 — landing on a real skill file is a deliberate act, not a\n  side effect of the mechanism existing.",
  flags: {
    target: { type: "string", describe: `Required. ${NAMED_TARGETS.join(", ")}, all, or a literal path` },
    yes: { type: "boolean", describe: "Actually write" },
    "dry-run": { type: "boolean", describe: "Report only (the default)" },
    config: { type: "string", describe: "Config file the sync records hashes in" },
  },
  run: async ({ flags }) => {
    const target = flags.target;
    if (typeof target !== "string") {
      throw new ArgError(`Missing --target. Expected one of ${NAMED_TARGETS.join(", ")}, all, or a path.`);
    }

    const yes = flags.yes === true;
    // The gate itself lives in `syncSkill` now, computed once for every
    // surface — this line only forwards what the operator typed.
    const dryRun = flags["dry-run"] === true;
    const configPath = typeof flags.config === "string" ? flags.config : defaultConfigPath();
    if (!existsSync(configPath)) {
      throw new ArgError(`No ${configPath}. Run \`roomyx init\` first.`);
    }

    for (const { name, path } of resolveTargets(target)) {
      const result = syncSkillBundle({
        bundledSkillPath: bundledSkillPath(),
        targetPath: path,
        configPath,
        dryRun,
        yes,
      });
      console.log(name === path ? path : `${name}: ${path}`);
      for (const warning of result.warnings) console.log(`  warning: ${warning}`);
      if (result.upToDate) {
        console.log("  already in sync — nothing written, no backup made");
      } else if (result.written) {
        console.log(result.backedUpTo ? `  written (backup: ${result.backedUpTo})` : "  written");
      } else {
        // "not written" was the message whenever `dryRun` was false, which
        // after the gate moved into syncSkill meant the ordinary
        // no-flags run reported a bare refusal instead of the sentence that
        // says how to proceed. Branch on why nothing was written, not on
        // which flag was passed.
        console.log(result.wouldWrite ? "  would write (pass --yes to apply)" : "  not written");
      }
    }
  },
};
