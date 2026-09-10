# ACTIONS

The current action list for roomyx, kept in the repository so it survives a
session. Updated at the end of each working session.

## State

| | |
|---|---|
| Released | `@mrciphersmith/roomyx@0.8.0` (tag `v0.8.0`, published with provenance) |
| `main` | green: `bun run check` → 358 pass / 0 fail |
| Flows | 001, 002, 003 — all `done` (`.metaproject/flows/`) |
| Open decisions | D-16, D-18 items 5, 6, 8 — recorded, not implemented |

## Next, in the order the dependencies suggest

1. **D-18 item 6 — the owner-command queue** (`room.get_pending_owner_commands`,
   `room://owner-queue`, `room.ack_owner_command`). The highest-value open item:
   `room.post_owner_command` still answers `accepted: false` for the primary
   scenario — a room served by a model-driven orchestrator spawns `serve` as a
   child process, and `onOwnerCommand` is a JS function that cannot be injected
   into it. `prd.md` R5's criterion ("at least one interactive command really
   reaches the room") has no measurable form until an ack exists.
2. **D-18 item 5 — `room.get_delta_for(agent_id, since_seq?)`.** Smallest of the
   three, and the one that removes per-turn accounting from the orchestrator's
   context. Do it *after* item 6, because it touches the same tool file and the
   temptation to bundle them is how a reviewable change stops being reviewable.
3. **D-18 item 8 — a representation for `goal_edit` / `add_participant`.** Not a
   task: the log format has no shape for an in-place update, `loadRoomLog`
   requires every line after the header to be a message, and choosing between a
   permitted record type and a distinguished message kind is a decision first.
4. **D-16 item 4 / D-18 item 1's residue — nothing.** The write side is honest
   as of 0.8.0; the read side is items 5 and 6 above.

## Known open, not scheduled

- **`RoomState` construction by an external embedder** is not exercised by any
  test. `dispatcherAttached` and `log_path` are optional by D-13, and the
  treatment of an absent value ("cannot be shown") is asserted only for
  `log_path`.
- **Windows path semantics** for the writer lease directory were never verified;
  the lease path is built with `node:path` and hashed from the log's absolute
  path, which is untested on a case-insensitive or `\`-separated filesystem.
- **`appendMessages` is all-or-nothing only for the failures it can observe.** An
  I/O failure partway through the appends leaves the earlier lines written. The
  bound is stated on the function; making it atomic is ruled out by the
  append-only contract.

## Working notes that cost time this session

- **`gh` reverts to the other account between calls.** Every push needs
  `gh auth switch --user MrCipherSmith` in the same command; otherwise the
  failure is `Permission … denied to aleksandr-tsaitler`, which names the account
  and not the cause.
- **`flow complete` will refuse on `tasks` if the review task is still open.**
  Close it as part of the review round, not at the end. Happened in flows 002
  and 003.
- **IP literals in text written to disk get redacted.** A source file was written
  containing `[REDACTED:ip]` as the loopback host, which threw at runtime while
  every test passed. Build host strings from their octets, and grep written files
  for the marker after any bulk write.
- **Stray `roomyx serve` processes hold the shell's pipe open**, which makes
  later commands look like they hang. Kill them after manual probing.
