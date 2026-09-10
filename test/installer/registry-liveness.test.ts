import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import {
  checkRoomLiveness,
  findRoomServing,
  listLiveRooms,
  listRooms,
  listRoomsWithLiveness,
  registerRoom,
} from "../../src/installer/registry";
import { defaultHistoryPath, readHistory } from "../../src/installer/history";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

/**
 * R7's rule, as tests: **identity mismatch is the one case where deleting is
 * correct — a timeout never is.**
 *
 * The defect this file pins was a collapsed return type. `probeRoomState`
 * returned `state | undefined`, and `undefined` had to mean both "I could not
 * reach it" and "the process is gone", so the caller resolved the ambiguity by
 * treating both as gone — and deleted a live room that was merely slow, writing
 * a history record claiming it had ended.
 *
 * The deterministic stand-in for "slow" is a live pid whose port answers nothing:
 * it takes the same `undefined` path as a 500 ms timeout without depending on
 * machine load. A SIGSTOP'd server is the field reproduction of the same path.
 */

let dir: string;
let registryPath: string;
let handle: ServeHandle | undefined;

function setup(): { logPath: string } {
  dir = mkdtempSync(join(tmpdir(), "roomyx-liveness-"));
  registryPath = join(dir, "registry.json");
  const logPath = join(dir, "room.jsonl");
  copyFileSync(FIXTURE, logPath);
  return { logPath };
}

afterEach(async () => {
  await handle?.close();
  handle = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("a room that cannot be reached is unknown, not gone", () => {
  test("the three answers are three values", async () => {
    const { logPath } = setup();
    // A port nothing listens on, with a pid that is definitely running.
    const unreachable = { id: "r-quiet", port: 1, logPath, pid: process.pid, startedAt: "s" };
    expect(await checkRoomLiveness(unreachable)).toBe("unknown");

    // A pid that is not running: the process is gone, whatever the port says.
    const deadPid = { ...unreachable, pid: 4_194_303 };
    expect(await checkRoomLiveness(deadPid)).toBe("gone");

    // A server that answers and names the log it is serving.
    handle = await serve(logPath, { port: 0 });
    const live = { ...unreachable, port: handle.port };
    expect(await checkRoomLiveness(live)).toBe("live");
  }, 20000);

  test("it is NOT removed from the registry file", async () => {
    const { logPath } = setup();
    const entry = registerRoom(registryPath, { port: 1, logPath, pid: process.pid });

    const result = await listLiveRooms(registryPath);
    // Not confirmed live, so not offered as one...
    expect(result.map((r) => r.id)).not.toContain(entry.id);
    // ...but still registered, because the probe proved nothing about it.
    expect(listRooms(registryPath).map((r) => r.id)).toContain(entry.id);
  }, 20000);

  test("it writes no history record", async () => {
    const { logPath } = setup();
    registerRoom(registryPath, { port: 1, logPath, pid: process.pid });

    await listLiveRooms(registryPath);

    // A history line is a claim that the room ended. Nothing here established
    // that — only that it did not answer within 500 ms.
    expect(readHistory(defaultHistoryPath(registryPath)).rooms).toHaveLength(0);
  }, 20000);

  test("and it is reported as unconfirmed rather than dropped", async () => {
    const { logPath } = setup();
    const entry = registerRoom(registryPath, { port: 1, logPath, pid: process.pid });

    const { live, unconfirmed } = await listRoomsWithLiveness(registryPath);
    expect(live).toHaveLength(0);
    expect(unconfirmed.map((r) => r.id)).toEqual([entry.id]);
  }, 20000);
});

describe("confirmed gone still prunes, and still archives", () => {
  test("an identity mismatch: a different room took the port", async () => {
    const { logPath } = setup();
    handle = await serve(logPath, { port: 0 });
    // Same port, live pid, a log the answering server is not serving.
    const other = registerRoom(registryPath, {
      port: handle.port,
      logPath: join(dir, "another-room.jsonl"),
      pid: process.pid,
    });

    await listLiveRooms(registryPath);

    expect(listRooms(registryPath).map((r) => r.id)).not.toContain(other.id);
    expect(readHistory(defaultHistoryPath(registryPath)).rooms.map((r) => r.id)).toContain(other.id);
  }, 20000);

  test("a registered pid that is not running", async () => {
    const { logPath } = setup();
    const crashed = registerRoom(registryPath, { port: 1, logPath, pid: 4_194_303 });

    await listLiveRooms(registryPath);

    expect(listRooms(registryPath).map((r) => r.id)).not.toContain(crashed.id);
    expect(readHistory(defaultHistoryPath(registryPath)).rooms.map((r) => r.id)).toContain(crashed.id);
  }, 20000);

  test("prune: false neither prunes nor archives anything", async () => {
    const { logPath } = setup();
    const crashed = registerRoom(registryPath, { port: 1, logPath, pid: 4_194_303 });

    await listLiveRooms(registryPath, { prune: false });

    expect(listRooms(registryPath).map((r) => r.id)).toContain(crashed.id);
    expect(readHistory(defaultHistoryPath(registryPath)).rooms).toHaveLength(0);
  }, 20000);
});

describe("the unconfirmed set is not the live set", () => {
  test("a live room and an unconfirmed one are reported apart", async () => {
    const { logPath } = setup();
    handle = await serve(logPath, { port: 0 });
    const live = registerRoom(registryPath, { port: handle.port, logPath, pid: process.pid });
    const quiet = registerRoom(registryPath, { port: 1, logPath, pid: process.pid });

    const { live: liveRooms, unconfirmed } = await listRoomsWithLiveness(registryPath);
    expect(liveRooms.map((r) => r.id)).toEqual([live.id]);
    expect(unconfirmed.map((r) => r.id)).toEqual([quiet.id]);
    // Auto-attach reads the confirmed list; nothing else may leak into it.
    expect(liveRooms.some((r) => r.id === quiet.id)).toBe(false);
  }, 20000);
});

describe("rooms list says what it knows", () => {
  test("a registered room that did not answer is shown, not dropped", async () => {
    const { logPath } = setup();
    const quiet = registerRoom(registryPath, { port: 1, logPath, pid: process.pid });

    const listed = Bun.spawnSync(["bun", join(import.meta.dir, "..", "..", "src", "cli.ts"), "rooms", "list", "--registry", registryPath]);
    const out = listed.stdout.toString();
    expect(out).toContain(quiet.id);
    expect(out).toContain("did not answer");
    // And it is not presented as live, which is the other way to be wrong.
    expect(out).not.toContain("No live rooms.");
  }, 20000);

  test("an empty registry still prints exactly the old sentence", async () => {
    setup();
    const listed = Bun.spawnSync(["bun", join(import.meta.dir, "..", "..", "src", "cli.ts"), "rooms", "list", "--registry", registryPath]);
    expect(listed.stdout.toString().trim()).toBe("No live rooms.");
  }, 20000);
});

describe("end to end: all three states in one registry", () => {
  test("with a generous probe budget, all three are classified correctly", async () => {
    // In-process with an explicit budget, because the point here is the
    // classification, not the default 500 ms probe. Under a loaded machine a
    // live room can legitimately come back `unknown` — that is the whole fix —
    // so a test that demands `live` at 500 ms would be testing the machine.
    const { logPath } = setup();
    handle = await serve(logPath, { port: 0 });
    const live = registerRoom(registryPath, { port: handle.port, logPath, pid: process.pid });
    const quiet = registerRoom(registryPath, { port: 1, logPath, pid: process.pid });
    const crashed = registerRoom(registryPath, { port: 1, logPath, pid: 4_194_303 });

    const { live: liveRooms, unconfirmed } = await listRoomsWithLiveness(registryPath, { timeoutMs: 5000 });
    expect(liveRooms.map((r) => r.id)).toEqual([live.id]);
    expect(unconfirmed.map((r) => r.id)).toEqual([quiet.id]);
    // Only the entry we have evidence about is removed, and only it is archived.
    expect(listRooms(registryPath).map((r) => r.id).sort()).toEqual([live.id, quiet.id].sort());
    expect(readHistory(defaultHistoryPath(registryPath)).rooms.map((r) => r.id)).toEqual([crashed.id]);
  }, 25000);

  test("rooms list never silently drops a room it could not confirm", async () => {
    const { logPath } = setup();
    handle = await serve(logPath, { port: 0 });
    const live = registerRoom(registryPath, { port: handle.port, logPath, pid: process.pid });
    const quiet = registerRoom(registryPath, { port: 1, logPath, pid: process.pid });
    const crashed = registerRoom(registryPath, { port: 1, logPath, pid: 4_194_303 });

    const listed = Bun.spawnSync(["bun", join(import.meta.dir, "..", "..", "src", "cli.ts"), "rooms", "list", "--registry", registryPath]);
    const out = listed.stdout.toString();
    const lineFor = (id: string) => out.split("\n").find((l) => l.includes(id)) ?? "";

    // Every room that is still registered is named. Whether the CLI had budget
    // to confirm the live one is a property of the machine, not of the code —
    // what must never happen is a registered room vanishing from the listing.
    expect(lineFor(live.id)).not.toBe("");
    expect(lineFor(quiet.id)).not.toBe("");
    // The one on a port nothing can be listening on is reported as not answering,
    // deterministically — no timeout is involved in a refused connection.
    expect(lineFor(quiet.id)).toContain("did not answer");
    // The confirmed-gone room is the only one removed, and the only one archived.
    expect(out).not.toContain(crashed.id);
    expect(listRooms(registryPath).map((r) => r.id).sort()).toEqual([live.id, quiet.id].sort());
    expect(readHistory(defaultHistoryPath(registryPath)).rooms.map((r) => r.id)).toEqual([crashed.id]);
  }, 25000);
});

describe("finding the entry that serves a log", () => {
  test("an unconfirmed entry is still found, because it is still an entry", async () => {
    // The append guard needs to know *which room is this* so it can ask it
    // whether a dispatcher is attached. A first probe that times out must not
    // make that lookup come back empty — a slow machine is not a statement
    // about whether anyone is writing.
    const { logPath } = setup();
    const quiet = registerRoom(registryPath, { port: 1, logPath, pid: process.pid });

    const lists = await listRoomsWithLiveness(registryPath);
    expect(lists.live).toHaveLength(0);
    expect(findRoomServing(logPath, lists)?.id).toBe(quiet.id);
  }, 20000);

  test("a log nobody serves has no entry, in either list", async () => {
    const { logPath } = setup();
    registerRoom(registryPath, { port: 1, logPath, pid: process.pid });
    const lists = await listRoomsWithLiveness(registryPath);
    expect(findRoomServing(join(dir, "other.jsonl"), lists)).toBeUndefined();
  }, 20000);
});
