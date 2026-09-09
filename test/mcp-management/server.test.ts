import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  test("roomyx.skills.sync writes via a real MCP round-trip (AC5)", async () => {
    setup();
    managementHandle = await serveManagement({ registryPath, bundledSkillPath: BUNDLED_SKILL, configPath }, { port: 0 });
    const client = await connectClient(managementHandle.url);

    const target = join(dir, "SKILL.md");
    const result = await client.callTool({
      name: "roomyx.skills.sync",
      arguments: { targetPath: target },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const sync = JSON.parse(text);
    expect(sync.written).toBe(true);

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
});
