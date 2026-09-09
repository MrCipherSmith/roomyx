import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serveManagement } from "../../src/mcp-management/server";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import { registerRoom } from "../../src/installer/registry";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");
const BUNDLED_SKILL = join(import.meta.dir, "..", "fixtures", "bundled-skill.md");

let dir: string;
let configPath: string;
let registryPath: string;
let managementHandle: ServeHandle | undefined;
let roomHandle: ServeHandle | undefined;

function setup() {
  dir = mkdtempSync(join(tmpdir(), "roomyx-mgmt-test-"));
  configPath = join(dir, "config.json");
  registryPath = join(dir, "registry.json");
  writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, defaultPort: 4319, roomLogDir: "" }));
}

afterEach(async () => {
  await managementHandle?.close();
  managementHandle = undefined;
  await roomHandle?.close();
  roomHandle = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function connectClient(url: string): Promise<Client> {
  const client = new Client({ name: "roomyx-mgmt-test-client", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

describe("MCP management server", () => {
  test("roomyx.rooms.list returns live rooms via a real MCP round-trip (AC5)", async () => {
    setup();
    roomHandle = await serve(FIXTURE, { port: 0 });
    registerRoom(registryPath, { port: roomHandle.port, logPath: FIXTURE, pid: process.pid });

    managementHandle = await serveManagement({ registryPath, bundledSkillPath: BUNDLED_SKILL, configPath }, { port: 0 });
    const client = await connectClient(managementHandle.url);

    const result = await client.callTool({ name: "roomyx.rooms.list", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const rooms = JSON.parse(text);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].port).toBe(roomHandle.port);

    await client.close();
  });

  test("roomyx.skills.sync reports what a sync would do, and writes nothing (AC5)", async () => {
    setup();
    // `keryx` is the project-scoped target, so pointing the server's `cwd` at a
    // temp directory keeps this test inside it. D-02: the mechanism is
    // exercised against fixtures, never a real `~/.claude/skills/...` file —
    // and now that the tool takes named targets only, `cwd` is the only way to
    // honour that.
    managementHandle = await serveManagement(
      { registryPath, bundledSkillPath: BUNDLED_SKILL, configPath, cwd: dir },
      { port: 0 },
    );
    const client = await connectClient(managementHandle.url);

    // `yes` used to be on this tool's input schema and reached `syncSkill`
    // untouched, so a caller could turn off D-02's overwrite guard by setting a
    // boolean for itself — over an unauthenticated loopback port, while the
    // CLI's own help said "Without --yes nothing is written". Deciding to land
    // on a real skill file is the operator's act, at the CLI. This surface
    // reports; it does not write.
    const target = join(dir, ".metaproject", "project-skills", "startup-room", "SKILL.md");
    const result = await client.callTool({
      name: "roomyx.skills.sync",
      arguments: { target: "keryx", yes: true },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    // An array because `target: "all"` fans out to several runtimes; one
    // target is the one-element case, not a different shape.
    const sync = JSON.parse(text);
    expect(sync).toHaveLength(1);
    expect(sync[0].path).toBe(target);
    expect(sync[0].wouldWrite).toBe(true);
    expect(sync[0].written).toBe(false);
    // And nothing reached the disk, which is the claim that matters.
    expect(existsSync(target)).toBe(false);

    await client.close();
  });

  test("roomyx.skills.sync no longer accepts a literal path — the arbitrary-path writer is gone", async () => {
    setup();
    managementHandle = await serveManagement(
      { registryPath, bundledSkillPath: BUNDLED_SKILL, configPath, cwd: dir },
      { port: 0 },
    );
    const client = await connectClient(managementHandle.url);

    const victim = join(dir, "victim.md");
    const result = await client.callTool({
      name: "roomyx.skills.sync",
      arguments: { targetPath: victim, yes: true },
    });

    // The schema rejects it: `target` is required and `targetPath` is not a
    // field any more, so an attacker-chosen path cannot reach syncSkill.
    expect(result.isError).toBe(true);
    expect(existsSync(victim)).toBe(false);

    await client.close();
  });

  test("roomyx.skills.sync refuses a call with no target at all", async () => {
    setup();
    managementHandle = await serveManagement(
      { registryPath, bundledSkillPath: BUNDLED_SKILL, configPath, cwd: dir },
      { port: 0 },
    );
    const client = await connectClient(managementHandle.url);

    const result = await client.callTool({ name: "roomyx.skills.sync", arguments: {} });
    expect(result.isError).toBe(true);

    await client.close();
  });

  test("the management server never writes to the room registry or bundled skill source (AC6-adjacent)", async () => {
    const { readFileSync } = await import("node:fs");
    setup();
    const beforeBundled = readFileSync(BUNDLED_SKILL, "utf8");

    managementHandle = await serveManagement({ registryPath, bundledSkillPath: BUNDLED_SKILL, configPath }, { port: 0 });
    const client = await connectClient(managementHandle.url);
    await client.callTool({ name: "roomyx.rooms.list", arguments: {} });
    await client.close();

    expect(readFileSync(BUNDLED_SKILL, "utf8")).toBe(beforeBundled);
  });

  test("supports multiple sequential client sessions against one long-lived instance", async () => {
    setup();
    managementHandle = await serveManagement({ registryPath, bundledSkillPath: BUNDLED_SKILL, configPath }, { port: 0 });

    const first = await connectClient(managementHandle.url);
    await first.callTool({ name: "roomyx.rooms.list", arguments: {} });
    await first.close();

    const second = await connectClient(managementHandle.url);
    const result = await second.callTool({ name: "roomyx.rooms.list", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(JSON.parse(text)).toEqual([]);
    await second.close();
  });
});
