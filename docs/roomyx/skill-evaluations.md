# Evaluations for the `startup-room` skill

Three scenarios, each with the behaviour that counts as passing. They live here
rather than in `src/bundled-skills/startup-room/` on purpose: these are for
whoever is changing the skill, not for the agent using it, and shipping them
would put a file in every install that nothing reads.

Run them by hand against a fresh agent with the skill loaded. There is no
runner — the guidance notes there is no built-in way to execute evaluations, and
writing one before there is a second skill to run it against would be building
the wrong thing.

**Why these three.** Each targets a failure that actually happened, reported by
the operator rather than imagined: a room that had to be told twice to fill
itself, an owner command that went into a queue nobody read, and a closed room
nobody could find again.

---

## E1 — One instruction, one room

**Setup.** A project with `.roomyx/` present and `roomyx` on `PATH`. No room
running.

**Query.** "Start a room with three people to work out whether we should move
the transcript format to JSONL."

**Passing behaviour:**

- Creates the log with `roomyx room new`, with a goal statement that came from
  the query rather than from a question back.
- Picks three participants itself, from the persona library, appropriate to the
  question — it does not ask which personas to use.
- Starts `roomyx serve … --port 0`.
- **Does not stop between any of those steps to confirm.**
- Its reply is the room id and `roomyx-client --room <id>`, plus one line naming
  who is in the room.

**Failing behaviour worth catching:** creating the log and then waiting; asking
which personas to cast; replying with the participants' opening contributions
instead of the attach command.

**The one question it may ask:** if the query has no goal that can be converged
on. "Start a room" with no subject is the case where asking is right.

---

## E2 — An owner command reaches the dispatcher

**Setup.** A room running with at least two participants and a few turns logged.

**Query.** Post a veto through the TUI (`o`, then `veto`), then let the room
take another turn.

**Passing behaviour:**

- The dispatcher runs `roomyx room commands <log>` between turns without being
  told to.
- It treats the veto as closed — relays it to whoever is working that thread as
  a decision, not as a question for the room to weigh.
- It runs `roomyx room ack <log> <id>` after acting, so the queue empties.

**Failing behaviour worth catching:** never looking at the queue at all (the
state before 0.11.2); looking but never acknowledging, so `pending` grows and
stops meaning anything; relaying the veto as an opinion for participants to
debate.

---

## E3 — A closed room is findable

**Setup.** A room that ran and was stopped.

**Query.** "What happened in that room about the transcript format?"

**Passing behaviour:**

- Finds it with `roomyx rooms history` rather than by guessing at file paths.
- Reopens it read-only — `roomyx-client --archive`, or `--open <log>` — rather
  than re-serving it or re-reading the raw JSONL into the conversation.

**Failing behaviour worth catching:** starting a new server for a finished room;
pasting the whole transcript into the chat; reporting that the room is gone
because `rooms list` shows nothing, which is the confusion `rooms history`
exists to end.

---

## Recording a run

Append a dated line per scenario: pass, fail, or partial, and what the agent
actually did when it was not a pass. A result without the observed behaviour is
not usable later — the point is to bring the specific failure back to the skill,
not the verdict.

| Date | Model | E1 | E2 | E3 | Notes |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
