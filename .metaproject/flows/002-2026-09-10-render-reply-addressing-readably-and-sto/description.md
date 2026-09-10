# Render reply addressing readably, and stop the kind tag disappearing with a collapsed header (D-17)

Status: formalized. Gated by `docs/roomyx/decisions.md` D-17.
Source: user report — "не понятно… кто кому пишет"; formalized from reading the
code and two real room logs.

## Problem

The transcript pane writes the reply target as a raw sequence number. A message
row is a header (bright name) plus a dim tag built from `[kind, in_reply_to]`,
and the tag prints `re #4` — a number nothing in the client resolves to a
speaker, including `Transcript.toText()`, which is what `w` writes out.

Measured in `docs/roomyx/screenshots/review-room.jsonl`: nine messages, four
participants, `in_reply_to` carried by four of them (5→4, 6→4, 7→1, 8→7). Two
rows in that room therefore render as identical `answer  re #4`, and a reader
cannot learn who #4 was without counting upwards. `@Name` appears zero times in
any body, so `@`-highlighting would guess.

Two further defects live in the same place, both found by reading the code:

1. The tag is invisible to search. `Transcript.matches()` builds its haystack
   from `fromName`, `kind` and `body` — the reply tag is on screen and `/`
   cannot find it, while `kind`, equally on screen, can. The comment above the
   haystack states the rule this breaks: match what a reader can actually see.
2. The tag disappears with a collapsed header. It is added inside
   `if (options.showHeader)`, and `showHeader` is `transcript.startsRun(index)`,
   false for consecutive messages from one speaker — so a second consecutive
   turn loses both its kind and its reply pointer. Worse, `startsRun` is computed
   over `visible()`, so the set of tags drawn depends on the active participant
   filter: a message can gain a tag by being filtered to that it did not have
   unfiltered.
3. The tag is assembled twice — `tagFor()` in `message-row.ts` and an inline
   expression in `transcript.ts` — so changing one leaves the export and the
   pane disagreeing.

## Expected Outcome

A reader of a live room can see who is answering whom, without counting, and
the same text they see is the text search finds and export writes.

## Out of Scope

- Branches/indentation by reply tree (rejected in D-17: the room is broadcast by
  design, the observed tree is degenerate, and indentation intersects the known
  wrap defect).
- `@Name` highlighting in bodies (D-17: zero occurrences in the real log).
- Back-references on the parent ("answered by …"): needs mutating an already
  drawn row, deferred in D-17.
- Jump-to-parent key: needs a transcript cursor, which does not exist (D-17).
- Everything in D-16 and D-18: participants gain no MCP surface, writer
  ownership, the owner-command queue, `get_delta_for`.
- The wrap defect itself (`test/client/wrap-defect.test.ts`) stays a
  `test.failing` tripwire. This flow must not introduce a new wrap boundary.
