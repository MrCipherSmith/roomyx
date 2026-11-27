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
    registerRoom(registryPath, { port: handle.port, logPath: FIXTURE, pid: process.pid, token: handle.token });

    const result = await resolveConnectionUrl({ registryPath });
    // The token comes back with the URL, not separately: a caller that could get
    // one without the other is a caller that reaches a room it cannot talk to.
    expect(result).toEqual({ ok: true, url: handle.url, token: handle.token });
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
    registerRoom(registryPath, { port: a.port, logPath: FIXTURE, pid: process.pid, token: a.token });
    registerRoom(registryPath, { port: b.port, logPath: FIXTURE, pid: process.pid, token: b.token });

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
    const entry = registerRoom(registryPath, { port: handle.port, logPath: FIXTURE, pid: process.pid, token: handle.token });

    const result = await resolveConnectionUrl({ room: entry.id, registryPath });
    expect(result).toEqual({ ok: true, url: handle.url, token: handle.token });
  });

  test("--room <id> for an unknown/dead id: clear room-not-found result", async () => {
    setup();
    const result = await resolveConnectionUrl({ room: "r-doesnotexist", registryPath });
    expect(result).toEqual({ ok: false, reason: "room-not-found" });
  });

  // `--connect` is the one client path with no registry entry to read a token
  // from, so it is the one that would have broken silently: a URL that resolves
  // and a room that answers 401 look, on screen, exactly like a room that is not
  // running. Both halves are pinned.
  test("--connect finds the token for a port this registry knows", async () => {
    setup();
    const handle = await serve(FIXTURE, { port: 0 });
    handles.push(handle);
    registerRoom(registryPath, { port: handle.port, logPath: FIXTURE, pid: process.pid, token: handle.token });

    // The URL is still used exactly as given — what is looked up is the
    // credential for a port the caller already named.
    const result = await resolveConnectionUrl({ connect: `http://localhost:${handle.port}/mcp`, registryPath });
    expect(result).toEqual({ ok: true, url: `http://localhost:${handle.port}/mcp`, token: handle.token });
  });

  test("an explicit --token wins over anything the registry holds", async () => {
    setup();
    const handle = await serve(FIXTURE, { port: 0 });
    handles.push(handle);
    registerRoom(registryPath, { port: handle.port, logPath: FIXTURE, pid: process.pid, token: handle.token });

    const result = await resolveConnectionUrl({
      connect: handle.url,
      token: "0".repeat(32),
      registryPath,
    });
    expect(result).toEqual({ ok: true, url: handle.url, token: "0".repeat(32) });
  });
});
