import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { init } from "../installer/init";
import { personaCount } from "../installer/personas";
import { bundledPersonasPath, bundledSkillPath } from "./shared";
import type { Command } from "./shared";

export const initCommand: Command = {
  usage: "roomyx init [flags]",
  summary: "scaffold .roomyx/, then set up skills, MCP and git for this project",
  notes:
    "Interactive when the terminal allows it: tick what you want, see every\n  path before agreeing to it, and nothing is written until you submit.\n  Through a pipe or in CI it scaffolds .roomyx/ and asks nothing, so it can\n  never hang waiting for a keypress nobody is there to make.",
  flags: {
    yes: { type: "boolean", describe: "Apply the default selection without asking" },
    "no-interactive": { type: "boolean", describe: "Scaffold .roomyx/ only" },
  },
  run: async ({ flags }) => {
    const cwd = process.cwd();
    const result = init({ cwd, bundledSkillPath: bundledSkillPath() });
    console.log(result.created ? `Created ${result.roomyxDir}` : `${result.roomyxDir} already initialized`);
    for (const warning of result.skillWarnings ?? []) {
      // Said out loud rather than swallowed: the staged copy is now known to
      // differ from the bundled skill, and whoever sees this decides what to
      // do about it.
      console.log(`  ! ${warning}`);
    }

    const { buildPlan, selectedItems } = await import("../installer/init-plan");
    const { applyPlan } = await import("../installer/init-apply");

    const plan = buildPlan({ cwd, personaFiles: personaCount(bundledPersonasPath()) });
    // A terminal on both ends or nothing to ask. `--yes` overrides, because
    // a script that has decided already should not be refused for lacking a
    // tty — but the default must never block a pipeline on a prompt.
    const interactive = process.stdout.isTTY === true && process.stdin.isTTY === true;
    if (flags["no-interactive"] === true || (!interactive && flags.yes !== true)) {
      console.log("");
      console.log("Nothing else was written. To install the skill and register the MCP server:");
      console.log("  roomyx init --yes          # the default selection, no prompt");
      console.log("  roomyx init                # pick, in a terminal");
      return;
    }

    let chosen = plan;
    if (flags.yes !== true) {
      const { runInitPicker } = await import("../client/init-screen");
      const picked = await runInitPicker(plan);
      if (picked === null) {
        console.log("Cancelled — nothing else was written.");
        return;
      }
      chosen = picked;
    }

    const results = applyPlan(selectedItems(chosen), {
      cwd,
      bundledSkillPath: bundledSkillPath(),
      bundledPersonasPath: bundledPersonasPath(),
      configPath: join(cwd, ".roomyx", "config.json"),
    });

    console.log("");
    for (const line of results) {
      console.log(`${line.ok ? "  ok " : "  !! "} ${line.label}`);
      console.log(`       ${line.path} — ${line.message}`);
    }

    const failed = results.filter((line) => !line.ok).length;
    if (failed > 0) console.log(`\n${failed} item(s) failed. Everything else was applied.`);
    if (results.some((line) => line.ok && line.id.startsWith("skill:"))) {
      // The one thing an operator reliably forgets, and the symptom is
      // "roomyx installed the skill and my agent still cannot see it".
      console.log("\nRestart your agent — skills are discovered at startup.");
    }
    console.log("\nNext: roomyx room new .roomyx/rooms/logs/<name>.jsonl --goal \"<what the room is for>\"");
  },
};

export const setupCommand: Command = {
  usage: "roomyx setup [flags]",
  summary: "set this machine up, without touching the current project",
  notes:
    "The same picker `roomyx init` shows, narrowed to the rows that land on\n  the machine: the skill for each agent runtime you use, and the persona\n  library under ~/.roomyx. Nothing is created in the current directory, so\n  this is what to run right after installing from npm — an npm lifecycle\n  script cannot ask, because npm runs one with no terminal (CI, `npm ci`,\n  Docker) and skips it entirely under --ignore-scripts.",
  flags: {
    yes: { type: "boolean", describe: "Apply the default selection without asking" },
  },
  run: async ({ flags }) => {
    const home = homedir();
    const cwd = process.cwd();
    // Its own config, under the home directory: `syncSkill` records the hash
    // of what it wrote so a later sync can tell "unchanged since we wrote it"
    // from "edited by someone", and a machine-wide install has no project
    // config to record into. Created here rather than demanded, because the
    // whole point of this command is that there is no project yet.
    const configPath = join(home, ".roomyx", "config.json");
    if (!existsSync(configPath)) {
      mkdirSync(join(home, ".roomyx"), { recursive: true });
      writeFileSync(configPath, JSON.stringify({ schemaVersion: 1 }, null, 2));
    }

    const { buildPlan, machineItems, selectedItems } = await import("../installer/init-plan");
    const { applyPlan } = await import("../installer/init-apply");
    const plan = machineItems(buildPlan({ cwd, personaFiles: personaCount(bundledPersonasPath()) }));
    // Ticked here, unticked in `init`, and the difference is the point. In a
    // project the machine-wide library is a second copy of one the project
    // already gets and the skill prefers. Here there is no project copy — so
    // leaving it off would set a machine up with a skill that casts its room
    // from personas that are nowhere on disk, which is the unfinished
    // installer this whole command exists to avoid.
    for (const item of plan) {
      if (item.id === "personas:user" && item.done === undefined) item.selected = true;
    }

    const interactive = process.stdout.isTTY === true && process.stdin.isTTY === true;
    if (!interactive && flags.yes !== true) {
      console.log("Not a terminal, so nothing was asked and nothing was written.");
      console.log("  roomyx setup --yes    # the default selection, no prompt");
      return;
    }

    let chosen = plan;
    if (flags.yes !== true) {
      const { runInitPicker } = await import("../client/init-screen");
      const picked = await runInitPicker(plan);
      if (picked === null) {
        console.log("Cancelled — nothing was written.");
        return;
      }
      chosen = picked;
    }

    const results = applyPlan(selectedItems(chosen), {
      cwd,
      bundledSkillPath: bundledSkillPath(),
      bundledPersonasPath: bundledPersonasPath(),
      configPath,
    });

    for (const line of results) {
      console.log(`${line.ok ? "  ok " : "  !! "} ${line.label}`);
      console.log(`       ${line.path} — ${line.message}`);
    }
    if (results.some((line) => line.ok)) {
      console.log("\nRestart your agent — skills are discovered at startup.");
    }
    console.log("\nNext, in a project: roomyx init");
  },
};
