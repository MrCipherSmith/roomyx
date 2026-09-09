import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { registerRoom } from "../../src/installer/registry";
import { resolveConnectionUrl } from "../../src/installer/resolve-connection";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let dir: string;
let registryPath: string;
let handles: ServeHandle[] = [];

function setup() {
  dir = mkdtempSync(join(tmpdir(), "roomyx-resolve-test-"));
  registryPath = join(dir, "registry.json");
}

afterEach(async () => {
  await Promise.all(handles.map((h) => h.close()));
  handles = [];
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveConnectionUrl", () => {
  test("--connect is used directly, bypassing the registry entirely", async () => {
    setup();
    const result = await resolveConnectionUrl({ connect: "http://example.invalid/mcp", registryPath });
    expect(result).toEqual({ ok: true, url: "http://example.invalid/mcp" });
  });

  test("no args: exactly one live room attaches automatically (AC3)", async () => {
    setup();
    const handle = await serve(FIXTURE, { port: 0 });
    handles.push(handle);
    registerRoom(registryPath, { port: handle.port, logPath: FIXTURE, pid: process.pid });

    const result = await resolveConnectionUrl({ registryPath });
    expect(result).toEqual({ ok: true, url: handle.url });
  });

  test("no args, zero live rooms: clear no-rooms result, not a crash (AC3)", async () => {
    setup();
    const result = await resolveConnectionUrl({ registryPath });
    expect(result).toEqual({ ok: false, reason: "no-rooms" });
  });

  test("no args, multiple live rooms: clear multiple-rooms result with candidates (AC3)", async () => {
    setup();
    const a = await serve(FIXTURE, { port: 0 });
    const b = await serve(FIXTURE, { port: 0 });
    handles.push(a, b);
    registerRoom(registryPath, { port: a.port, logPath: FIXTURE, pid: process.pid });
    registerRoom(registryPath, { port: b.port, logPath: FIXTURE, pid: process.pid });

    const result = await resolveConnectionUrl({ registryPath });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("multiple-rooms");
      expect(result.candidates).toHaveLength(2);
    }
  });

  test("--room <id> attaches to that specific room", async () => {
    setup();
    const handle = await serve(FIXTURE, { port: 0 });
    handles.push(handle);
    const entry = registerRoom(registryPath, { port: handle.port, logPath: FIXTURE, pid: process.pid });

    const result = await resolveConnectionUrl({ room: entry.id, registryPath });
    expect(result).toEqual({ ok: true, url: handle.url });
  });

  test("--room <id> for an unknown/dead id: clear room-not-found result", async () => {
    setup();
    const result = await resolveConnectionUrl({ room: "r-doesnotexist", registryPath });
    expect(result).toEqual({ ok: false, reason: "room-not-found" });
  });
});
