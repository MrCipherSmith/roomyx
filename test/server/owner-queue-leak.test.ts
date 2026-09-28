import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { connectToRoom } from "../helpers/room-client";
import { serve } from "../../src/server/serve";
import type { ServeHandle } from "../../src/server/serve";
import type { QueuedOwnerCommand } from "../../src/server/owner-queue";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "sample-room.jsonl");

let handle: ServeHandle | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

function textOf(result: unknown): string {
  return (result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
}

/**
 * A dispatcher that throws fills the queue it was supposed to drain.
 *
 * `room.post_owner_command` posts the command, awaits `onOwnerCommand`, and
 * *then* acks — with no `try`/`finally`. A handler that throws therefore leaves
 * the entry pending forever: the owner is told the call failed, the dispatcher
 * never saw a command it could act on, and the slot is gone. `OWNER_QUEUE_LIMIT`
 * is 32, so 32 handler failures over the life of a room — hours, per the queue's
 * own comment — turn every later veto into `OwnerQueueFullError`, whose message
 * accuses the operator of not reading a queue that has nothing readable in it.
 *
 * This is the "held either way" claim in the option's own documentation: the
 * handler is a second road into one queue, not a parallel one. It holds only
 * while the handler resolves.
 */
describe("a throwing onOwnerCommand", () => {
  test("leaves nothing pending behind it", async () => {
    let calls = 0;
    handle = await serve(FIXTURE, {
      port: 0,
      onOwnerCommand: () => {
        calls += 1;
        throw new Error("the dispatcher fell over");
      },
    });
    const client = await connectToRoom(handle, "owner-queue-leak-test");

    const posts = 3;
    for (let i = 0; i < posts; i += 1) {
      const result = await client.callTool({
        name: "room.post_owner_command",
        arguments: { kind: "veto", body: `not that direction (${i})` },
      });
      // The failure is reported, which is correct and is not what this is about.
      expect(result.isError).toBe(true);
    }
    expect(calls).toBe(posts);

    const pending = await client.callTool({ name: "room.get_pending_owner_commands", arguments: {} });
    const held = JSON.parse(textOf(pending)) as QueuedOwnerCommand[];
    // The entry is settled whichever way the handler went. A slot held for a
    // handler that already failed is one nothing will ever drain.
    expect(held).toEqual([]);

    await client.close();
  }, 20000);
});
