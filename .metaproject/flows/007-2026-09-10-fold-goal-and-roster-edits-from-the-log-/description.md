# Fold goal and roster edits from the log, so a room's state is what the room last said (D-19, backlog item 8)

Status: formalized. Implements `docs/roomyx/decisions.md` **D-19**, which decided
the shape this flow builds.

## Problem

A room's state lives in the **first line** of its log and nowhere else. That line
cannot be rewritten — the log is append-only — and it cannot be followed by a
second one, because `loadRoomLog` requires every line after the header to satisfy
`messageLineSchema`, so a second state line makes the room unreadable forever.

The consequence is that the two owner commands that change state have nowhere to
land:

- `goal_edit` — the goal contract never changes.
- `add_participant` — the roster never grows.

Meanwhile `goalContractSchema` carries `updated_in_round` and `updated_by:
"owner"`, which **nothing has ever written**: fields designed for an update path
that was never built. And the dispatcher already posts a `status` message when the
owner edits the goal, so the room says one thing in its transcript while
`room.get_state` reports the original contract. Since R12 the status bar shows
that threshold, which means the interface now displays a number the room may have
already moved.

## Expected Outcome

- A goal edit and a roster addition reach the log as **ordinary messages** of a
  new kind, carrying the structured change in one optional field beside a
  human-readable body.
- `room.get_state` returns the **folded** state: the header, then every edit in
  `seq` order, with the last one winning.
- The rule that "an edit message must carry a matching change" is expressed
  **once**, in the schema module that both the writer and the reader depend on
  (D-08). The writer refuses to write a violation; the reader does not fold one it
  finds.
- The transcript still shows the edit as text a person can read. No JSON in the
  message pane.
- Nothing rewrites existing lines: the log stays append-only, byte for byte, and
  the header keeps its original content.

## Out of Scope

- **Editing the roster's *existing* entries** — renaming or removing a
  participant. D-19 covers adding. Removing a participant mid-room raises what its
  prior messages then mean, which is a different decision.
- **Threshold sanity** (e.g. `pass_at_or_above > fail_below`, or a goal whose
  criteria are empty). The schema checks *shape*; whether an edit is sensible is
  the dispatcher's judgement, and validating it here would refuse edits a room
  might have a reason to make.
- **`learn`/`history` summary semantics** after an edit. `archiveRoom` reads the
  header today; whether a closed room's history should record the goal it *ended*
  with is a follow-up, and the index already stores the goal it was created with.
- **The TUI rendering of an edit beyond the ordinary message row.** It shows as a
  message with a `goal_edit` tag; a special presentation is not asked for and not
  needed.
