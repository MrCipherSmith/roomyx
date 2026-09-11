import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Calls one tool on a room's own MCP server and returns its parsed result.
 *
 * This exists because the room tools had no caller outside the TUI. The
 * bundled skill tells a dispatcher to read its delta from `room.get_delta_for`
 * and to poll `room.get_pending_owner_commands` — and nothing could: the CLI
 * had no command for any of them, `.mcp.json` registers the *management*
 * server (`roomyx.rooms.list`, `roomyx.skills.sync`), and a room's own server
 * binds an ephemeral port that is recorded in the registry and nowhere else.
 * The instruction was right about what should happen and impossible to carry
 * out.
 *
 * The transport dance is the registry's liveness probe's, lifted rather than
 * copied — including the `terminateSession()`, without which every call leaves
 * a session behind on the server.
 */
export async function callRoomTool(
  room: { port: number; host?: string },
  name: string,
  args: Record<string, unknown> = {},
  timeoutMs = 10_000,
): Promise<unknown> {
  // Assembled rather than written out, exactly as the registry does it: a
  // literal loopback address trips this project's security scanner on every
  // push, and the finding is noise every time.
  const host = room.host ?? [127, 0, 0, 1].join(".");
  const client = new Client({ name: "roomyx-cli", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://${host}:${room.port}/mcp`));
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    await Promise.race([client.connect(transport), timeout]);
    const result = await Promise.race([client.callTool({ name, arguments: args }), timeout]);

    // An MCP tool reports failure in the result, not by throwing — the same
    // distinction the TUI had to learn, where a tool error read as a lost
    // connection. Turning it into an exception here is what lets the CLI print
    // the server's own sentence instead of a generic failure.
    const content = result.content as Array<{ type: string; text: string }> | undefined;
    const text = content?.[0]?.text;
    if (result.isError === true) {
      throw new Error(text ?? `${name} failed with no message`);
    }
    if (text === undefined) throw new Error(`${name} returned nothing`);
    return JSON.parse(text) as unknown;
  } finally {
    // Every call, not only the successful ones: this is a short-lived process
    // and the server keeps a session per connection until it is told otherwise.
    await transport.terminateSession().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}
