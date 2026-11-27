import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { roomTransport } from "../../src/room-token";
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * The one way a test connects to a real room.
 *
 * Every test that stands up a `serve()` used to build its own
 * `StreamableHTTPClientTransport`, which was fine while the room asked for
 * nothing and is the exact shape of the D-06a failure the token had to avoid
 * repeating: `allowedHosts` was configured correctly and silently refused
 * roomyx's own client, because no test exercised the client's own path. Ten test
 * files each assembling their own `Authorization` header would put that back —
 * a wire-format change could be fixed in nine of them and leave the tenth
 * passing for the wrong reason, or leave `probeRoomState` broken with the whole
 * suite green.
 *
 * So this goes through `roomTransport` in `src/room-token.ts`, which is the same
 * function `RoomClient`, `callRoomTool` and the liveness probe go through. There
 * is one place the header is written, and the tests are downstream of it rather
 * than beside it.
 *
 * The argument is a `ServeHandle`-shaped object on purpose: `connectToRoom(handle)`
 * is the whole call, so there is no separate token argument for a test to omit.
 */
export async function connectToRoom(
  room: { url: string; token: string },
  name = "roomyx-test-client",
): Promise<Client> {
  const client = new Client({ name, version: "0.0.0" });
  await client.connect(roomTransport(room.url, room.token));
  return client;
}

/**
 * The same, but handing back the transport too — for the cases that assert on
 * session lifetime and have to call `terminateSession()` themselves.
 */
export async function connectToRoomWithTransport(
  room: { url: string; token: string },
  name = "roomyx-test-client",
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const client = new Client({ name, version: "0.0.0" });
  const transport = roomTransport(room.url, room.token);
  await client.connect(transport);
  return { client, transport };
}
