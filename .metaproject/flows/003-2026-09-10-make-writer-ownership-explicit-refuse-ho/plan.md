# Implementation Plan

Status: ready to freeze.

## Approach

Four changes, in the order the honesty of each one depends on:

1. **The server reports what it knows** (`dispatcherAttached`) — without it, every
   later decision is a hedge.
2. **The CLI's refusal becomes a decision table** over (live?, dispatcher
   attached?, lease fresh?) instead of a single hedged refusal with an override.
3. **The lease** gives the third column a value, held by the server when it has
   a dispatcher — see the amendment in `description.md` for why it cannot be the
   one-shot CLI.
4. **The write side stops assembling JSON in a shell** (`--json`, `--body-file -`,
   `--many`), because the dispatcher's bodies are arbitrary prose.

The resulting table, which is the whole point of the flow:

| Room serving the log | Dispatcher attached | Lease | `room append` | `--take-over` |
| --- | --- | --- | --- | --- |
| no | — | — | writes | writes |
| yes | no | none | **writes, no flag needed** | writes |
| yes | yes | fresh | refuses | refuses |
| yes | yes | stale/absent | refuses | writes, and records it in the log |

The second row is what `--force` was really for, and under this table it needs no
flag at all — which is what lets the override be deleted rather than renamed.

## Steps

1. **Red tests first**, run and captured: `dispatcherAttached` both ways; plain
   `append` against a bare `serve` succeeding without a flag; `--force` rejected
   as an unknown flag; refusal against a live dispatcher; `--take-over` refused
   against a fresh lease and accepted against a stale one; the take-over trace in
   the log; two concurrent appends never both writing.
2. `dispatcherAttached` in `RoomState` and in the `room.get_state` tool.
3. `src/writer-lease.ts`: acquire/refresh/release/stale-read, modelled on
   `withLock`'s owner token — a lease released by a process that no longer holds
   it must not unlink the next holder's file.
4. `serve()` writes and refreshes the lease iff a dispatcher is attached; the CLI
   reads it. `--force` removed from the flag specs, the guard rewritten as the
   table, `--take-over` added.
5. `--json <envelope>`, `--body-file -`, `--many` (JSONL on stdin, all-or-nothing:
   one invalid line writes nothing).
6. Update `src/bundled-skills/startup-room/SKILL.md`: the documented command loses
   `--force`, and the paragraph that defends it is replaced by the reason it is no
   longer needed.
7. `CHANGELOG.md` + `package.json` minor bump (`0.8.0`, D-13).

## Risks

- **Breaking a passing test on purpose.** `test/cli-room.test.ts` asserts `--force`
  writes. That half is meant to die; the flow journal records it so it is not read
  as a regression later.
- **A lease that outlives its holder** would refuse legitimate writes. Mitigated by
  a staleness ceiling and by `--take-over` being reachable; the ceiling and the
  recovery path are both tested, in the same shape `withLock` already uses.
- **The lease file's home.** Beside the registry (machine-local, gitignored), not
  beside the log — logs travel with the repository and a lease must not. This
  means `serve()` needs the lease path passed in, since it does not know the
  registry path today; the parameter is optional so the library entry point keeps
  working for embedders that do not dispatch.
- **Scope creep into items 5/6.** Named as out of scope in `description.md`; the
  temptation will be `get_delta_for`, which is the smallest-looking of the three
  and touches the same tool file.
