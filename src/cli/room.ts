import { resolve } from "node:path";
import { callRoomTool } from "../installer/room-tool";
import { createRoomLog, parseRoster } from "../log/write";
import { ArgError } from "./args";
import { REGISTRY_FLAG, defaultRegistryPath, servingRoomFor } from "./shared";
import type { Command } from "./shared";

export const roomNew: Command = {
  usage: "roomyx room new <path> --goal <statement> [flags]",
  summary: "create a room log",
  notes: "Refuses to overwrite an existing log — a room log is append-only.",
  flags: {
    goal: { type: "string", describe: "Required. What the room is for, in one sentence" },
    criteria: { type: "string", describe: "Success criteria, stored in the goal contract" },
    roster: { type: "string", describe: "Participants, as id:Name,id2:Name2" },
  },
  run: async ({ positionals, flags }) => {
    const path = positionals[0];
    if (!path) throw new ArgError("Missing <path>.");
    const goalStatement = flags.goal;
    if (typeof goalStatement !== "string") {
      throw new ArgError("Missing --goal. A room without a stated goal has nothing to converge on.");
    }
    const absolute = resolve(path);
    createRoomLog(absolute, {
      goalStatement,
      criteria: typeof flags.criteria === "string" ? flags.criteria : undefined,
      roster: typeof flags.roster === "string" ? parseRoster(flags.roster) : [],
    });
    console.log(`Created ${absolute}`);
    console.log(`serve it with \`roomyx serve ${path}\``);
  },
};

export const roomDelta: Command = {
  usage: "roomyx room delta <logPath> --for <agentId> [flags]",
  summary: "what a participant has not seen yet",
  notes:
    "Reads the room's own server, so the room must be running. This is the\n  arithmetic a dispatcher used to redo in its own context every turn — the\n  server computes it, and reports which cursor it used so an empty delta is\n  distinguishable from a wrong one.",
  flags: {
    for: { type: "string", describe: "Required. Participant id" },
    since: { type: "number", describe: "Cursor to use instead of that participant's last message" },
    registry: REGISTRY_FLAG,
  },
  run: async ({ positionals, flags }) => {
    const path = positionals[0];
    if (!path) throw new ArgError("Missing <logPath>.");
    const agentId = flags.for;
    if (typeof agentId !== "string" || agentId === "") throw new ArgError("Missing --for <agentId>.");
    const absolute = resolve(path);
    const registryPath = resolve(typeof flags.registry === "string" ? flags.registry : defaultRegistryPath());
    const room = await servingRoomFor(absolute, registryPath);
    const args: Record<string, unknown> = { agent_id: agentId };
    if (typeof flags.since === "number") args.since_seq = flags.since;
    console.log(JSON.stringify(await callRoomTool(room, "room.get_delta_for", args), null, 2));
  },
};

export const roomCommands: Command = {
  usage: "roomyx room commands <logPath> [flags]",
  summary: "owner commands waiting for the dispatcher",
  notes:
    "The owner posts these from the TUI and nothing pushes them — a dispatcher\n  has to look. Poll between turns, then settle each one with `room ack`.",
  flags: { registry: REGISTRY_FLAG },
  run: async ({ positionals, flags }) => {
    const path = positionals[0];
    if (!path) throw new ArgError("Missing <logPath>.");
    const absolute = resolve(path);
    const registryPath = resolve(typeof flags.registry === "string" ? flags.registry : defaultRegistryPath());
    const room = await servingRoomFor(absolute, registryPath);
    console.log(JSON.stringify(await callRoomTool(room, "room.get_pending_owner_commands", {}), null, 2));
  },
};

export const roomAck: Command = {
  usage: "roomyx room ack <logPath> <commandId> [flags]",
  summary: "say an owner command has been dealt with",
  notes:
    "Without this, `pending` grows forever and stops meaning \"not yet handled\".",
  flags: { registry: REGISTRY_FLAG },
  run: async ({ positionals, flags }) => {
    const path = positionals[0];
    const id = positionals[1];
    if (!path) throw new ArgError("Missing <logPath>.");
    if (!id) throw new ArgError("Missing <commandId>. `roomyx room commands <logPath>` lists them.");
    const absolute = resolve(path);
    const registryPath = resolve(typeof flags.registry === "string" ? flags.registry : defaultRegistryPath());
    const room = await servingRoomFor(absolute, registryPath);
    console.log(JSON.stringify(await callRoomTool(room, "room.ack_owner_command", { id }), null, 2));
  },
};
