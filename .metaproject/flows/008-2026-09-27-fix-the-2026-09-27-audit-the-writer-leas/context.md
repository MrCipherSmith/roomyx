# Context

Source of the work: `docs/roomyx/audit-2026-09-27.md` — nine independent passes
over the whole of `src/` at `0.12.2`, commit `9fcec60`.

## Baseline at flow start

`bun install` was required first — `node_modules` was empty after two weeks
idle, and `bun run check` failed at `eslint: command not found`. After install:
eslint clean, `tsc --noEmit` clean, **457 pass / 5 skip / 0 fail**, 2202
assertions, 36.7 s. `bun audit`: 0 vulnerabilities / 194 packages.

## Call sites this flow touches

| Concern | File:line | What is there now |
|---|---|---|
| Lease acquired, never released | `src/cli.ts:493` | `acquireWriterLease(...)`; no `releaseWriterLease` anywhere outside `src/server/serve.ts:107` |
| Lease trusted without a liveness check | `src/cli.ts:408` | `writerPresent`; `isPidAlive` exists at `src/installer/registry.ts:255`, uncalled from here |
| Provenance narrowed away | `src/writer-lease.ts:88` | `parseLease` returns `{token, pid, at}` only |
| Stale vs displaced collapsed | `src/writer-lease.ts:113`, `src/server/serve.ts:89` | `readWriterLease` returns `held: false` for both |
| `seq` unbounded | `src/log/schema.ts:91` | `seq: z.number().int().min(1)` |
| Whole-log parse per append | `src/log/write.ts:71-78`, called at `:100` inside `withLock` | `nextSeq` + `Math.max(...seqs)` |
| Lock deadline below stale window | `src/lockfile.ts:54` vs `:7` | `deadline = now + 5000`; `STALE_LOCK_MS = 30_000` |
| Owner-queue slot leak | `src/server/index.ts:197` | `await options.onOwnerCommand(...)` then `queue.ack(...)`, no `try/finally` |
| Shutdown skips exit | `src/server/shutdown.ts:34`, `src/client/shutdown.ts:34` | `cleanup()` inside `.finally()`; always `exit(0)` |
| Symlink-following backup | `src/installer/skill-sync.ts:127` | `copyFileSync` + `writeFileSync`, no `lstat` |
| Unauthenticated MCP endpoint | `src/server/http-transport.ts:202` | no credential on any path |
| MCP config cast | `src/installer/init-apply.ts:136` | `JSON.parse(text) as McpConfig` |
| `limit: 0` accepted | `src/server/index.ts:113` | `min(0)` |
| Whole-log parse per read | `src/log/store.ts:28`, callers `src/server/tools/*.ts` | `loadRoomLog`, no cache |
| Unconditional sort | `src/log/store.ts:108` | `[...messages].sort(...)` in `foldEdits` |
| Server SDK pulled into the TUI | `src/client/owner-prompt.ts:1` | imports `OWNER_COMMAND_KINDS` from `../server/index` (a re-export of `./owner-queue`) |
| Lockfiles left tracked | `src/installer/init-apply.ts:89` | `.roomyx/rooms/*.lock`; logs live in `.roomyx/rooms/logs/` |
| Guards not run automatically | `.github/workflows/` | no reference to `scripts/soak.ts`, `fuzz-log.ts`, `replay.ts` |

## Measurements already taken (reproduce, do not re-derive)

Synthetic rooms, benchmark run during the audit:

| n messages | `loadRoomLog` | `nextSeq` | tail delta |
|---:|---:|---:|---:|
| 100 | 2.7 ms | 0.11 ms | <0.6 ms |
| 5,000 | 5.5 ms | 1.99 ms | <0.6 ms |
| 10,000 | 32 ms | 5.16 ms | <0.6 ms |
| 20,000 | 50 ms | 46.89 ms | 0.59 ms |

`bun build src/client/owner-prompt.ts` = **465,800 bytes**;
`bun build src/server/owner-queue.ts` = **1,159 bytes**.

CLI startup: ~90–100 ms — clean, no work needed.

## Binding decisions

`docs/roomyx/decisions.md` D-01..D-20 plus D-01a, D-06a;
`docs/roomyx-installer/decisions.md` D-01..D-04. The ones this flow must respect
or amend:

- **D-01 / D-01a** — one writer per live room; the rule constrains the server,
  not the package. The lease fix must not weaken the invariant, only stop an
  inert guard from refusing legitimate writes.
- **D-06 / D-06a** — Streamable HTTP on loopback, no token in v1; rebinding
  protection added because loopback does not bound a browser. D-06a states
  plainly that the guards stop a browser and *not* a neighbouring process. The
  token in this flow is the amendment D-06b, and must not be described as
  authentication.
- **D-08** — the log contract lives in one module and both sides import it. The
  `seq` bound belongs in `schema.ts`, not in a caller.
- **D-10** — one locking discipline for both the registry and the data;
  allocation and write are one critical section. The `nextSeq` change must keep
  them one section.
- **D-11** — the network surface reports, the operator decides. The `skills.sync`
  tool has no `yes`; nothing here may add one.
- **D-12** — three items deferred with reasons; the third is `limit` for
  `room.get_transcript`, whose first half shipped. The memoisation half is what
  Wave C closes.
- **D-13** — in `0.x`, minor is breaking and patch carries everything else. The
  per-room token changes the wire contract for any external client, which is the
  version question for the release task.

## Backlog state

`docs/roomyx/improvement-backlog.md`: 25 of 26 items confirmed done against the
0.12.2 source, one open (R10 memoisation half — Wave C). R3's own
"definition of done" text is stale: it prescribes a `--force` flag removed in
0.8.0 and a hard refusal 0.11.2 shipped and 0.11.3 reverted.
`ACTIONS.md`'s D-18 triage table omits item 7, which is in fact shipped.

## Prior flows

001–007 are all `done`. 003 is the closest neighbour — *"Make writer ownership
explicit: refuse honestly, and replace `--force` with a take-over that cannot be
abused"* — and is the flow that introduced the lease this one has to correct.
Read its journal before touching `writer-lease.ts`.
