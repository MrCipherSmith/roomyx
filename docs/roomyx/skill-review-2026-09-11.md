# Skill review against Anthropic's authoring guidance — 2026-09-11

Measured, not recalled. Every number below came from the file as it stands at
`v0.11.4`, and every rule from the published guidance:

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Subagents](https://code.claude.com/docs/en/sub-agents)

## What the skill measures today

| | Measured | Rule | |
| --- | --- | --- | --- |
| `name` | `startup-room`, 12 chars | ≤ 64, lowercase/hyphens, no reserved words | ok |
| `description` | **1162 chars** | **≤ 1024** | **over** |
| Body | 272 lines | < 500 lines | ok |
| Body | ~7 900 tokens | "concise once loaded" | heavy |
| Reference files | 0 | progressive disclosure, one level deep | none |
| Frontmatter fields | `name`, `description` | both required | ok |

## Findings

### F1 — The dispatcher cannot call the tools it is told to call

`0.11.2` rewrote the turn loop to use `room.get_delta_for` and to poll
`room.get_pending_owner_commands` / `room.ack_owner_command`. Nothing can reach
them:

- the CLI has no command that calls any of the three;
- `.mcp.json`, written by `roomyx init`, registers the **management** server —
  `roomyx.rooms.list` and `roomyx.skills.sync`, not the per-room tools;
- a room's own server binds an ephemeral port and is registered nowhere.

So the instruction is right about what should happen and impossible to carry
out. This is a defect introduced by the rewrite that fixed a different one, and
it is first in the plan for that reason.

### F2 — `description` exceeds the hard limit

1162 characters against a documented maximum of 1024. Claude Code loads it
anyway; the API's skill validation would not, so the skill is not portable. It
is also the field skill selection runs on, and ours is a single run-on sentence
rather than the recommended "what it does, and when to use it".

### F3 — No progressive disclosure

One file, ~7 900 tokens, loaded whole every time the skill triggers — including
for rooms that have nothing to do with startup ideas. Two blocks are
self-contained and conditional:

- the 50-criteria rubric — 724 tokens, only for the startup-idea goal type;
- "Watching the room live (roomyx)" — ~1 000 tokens, only when roomyx is present.

### F4 — Nesting depth is bounded and unwritten

Subagent spawning is capped at three layers below the main conversation. Our
shape — main → dispatcher → participants — is two and fits, but nothing in the
skill says so, and the next person to give participants their own helpers will
hit a ceiling with no warning.

Recorded alongside it: the documentation states that a background subagent keeps
a tool list that does **not** include `Agent`. A direct probe on 2026-09-11
contradicted that — a background subagent had `Agent` and spawned a nested agent
successfully. Behaviour is what we build on; the discrepancy is written down
rather than smoothed over.

### F5 — No evaluations

The guidance asks for evaluations before documentation. The skill has a test,
but it pins *text* — that certain phrases are present or absent. Nothing
measures whether an agent given the skill actually casts a room without asking
twice.

## Not doing

- **Renaming to a gerund** (`running-persona-rooms`). The guidance prefers
  gerunds and names noun phrases an acceptable alternative. Renaming breaks every
  existing install for a stylistic preference.
- **Trimming the turn loop's "round-robin, or reactive, or…"** to one option.
  It reads like the "too many choices" anti-pattern, but choosing who speaks next
  is exactly the judgement the room is supposed to exercise; this is the
  high-freedom case the same guidance describes.

## Plan, in dependency order

### 1. Make the tools reachable — `roomyx room delta | commands | ack` — **done**

Three CLI commands over the room's MCP surface, resolved through the registry
the same way `room append` already finds a live room.

- `roomyx room delta <log> --for <id> [--since <seq>]` → the participant's unseen
  messages, with `since_seq` and `cursor_from`.
- `roomyx room commands <log>` → pending owner commands.
- `roomyx room ack <log> <id>` → settle one.

**Done when:** each is exercised end to end against a live `roomyx serve` in a
test, and the skill's instructions name the commands rather than the tools.

**Done 2026-09-11.** Five end-to-end tests against a live server, and the skill
now prints the commands. A second test asserts the other direction — that every
command the skill names exists in the CLI — because a skill naming a command
this package does not ship is the same defect wearing different clothes; it is
mutation-checked by renaming one. Measured cost to a dispatcher: 221 ms per
call, of which 225 ms is `bun` starting, so the command itself is free. Cost to
the suite: it went from ~25 s to ~88 s, which is what end-to-end tests of a
server cost.

### 2. Rewrite `description` under the limit

Two sentences: what it does, and when to use it. Third person. Keep the trigger
words that make it discoverable — personas, room, debate, brainstorm, interview,
convergence.

**Done when:** length is asserted in the skill-sync test, so it cannot drift back
over 1024.

### 3. Split the conditional blocks out

`rubric-50.md` and `roomyx.md` beside `SKILL.md`, linked one level deep from it.

**Done when:** the body is meaningfully smaller, both files are reachable by a
single link from `SKILL.md`, and the bundled-skill installer copies the whole
directory rather than one file.

### 4. Write the nesting limit into the skill

One paragraph in the dispatcher section: three layers, we use two, and what the
third would cost.

### 5. Evaluations

Three scenarios with expected behaviour, as data beside the skill: a room cast
without a second question; an owner command posted mid-room and acted on; a
closed room reread from history.

**Done when:** they exist as a file a person can run by hand, with the expected
behaviour written down. Automating them is out of scope here.

## Ordering rationale

1 first because the skill currently instructs something impossible. 2 next
because it is five minutes and makes the skill portable. 3 after those two,
because splitting a file whose contents are still changing means doing it twice.
4 and 5 are additive and can follow in any order.
