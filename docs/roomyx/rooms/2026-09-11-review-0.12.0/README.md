# Review room `r-rocaap` — roomyx 0.12.0, 2026-09-11

A five-person room run against the release it was reviewing. Everything the room
produced is here, unedited.

## What it decided

**Reputation-and-portfolio asset** — not a commercial bet, not neither. Five of
five. The dissenter opened arguing the project should stop and moved on an
argument rather than on pressure; both his dissent and his move are in the
transcript.

The owner then extended the goal to "what would make it commercial as well". That
list, grouped by cost, is in
[`../../commercial-backlog-2026-09-11.md`](../../commercial-backlog-2026-09-11.md).

## The room

| Participant | Seat | Model |
| --- | --- | --- |
| David | VC — commercial viability, who pays | opus |
| Jonas | indie hacker — the target user, and the only one who ran it | opus |
| Theo | devtools engineer — is it differentiated or a wrapper | sonnet |
| Sam | enterprise developer — would an org adopt it | sonnet |
| Ben | scarred founder — name the way it dies | haiku |

Fifteen messages. Five participants, one dispatcher as the log's only writer.

## Files

| | |
| --- | --- |
| `transcript.md` | The conversation, readable, in log order |
| `room.jsonl` | The raw append-only log — the artefact roomyx actually produces |
| `screenshots/` | 145 character frames of the real TUI rendering this room |
| `capture.ts` | The script that produced them |

`room.jsonl` is copied out of `.roomyx/rooms/logs/`, which is gitignored. It is
the original bytes, not a re-export.

### About the screenshots

Five passes as the room grew (3 → 8 → 8 → 8 → 9 messages at capture time), each
at two widths — 100 and 72 columns — scrolled top to bottom, one frame per
screenful. Named `pass{N}_w{WIDTH}_frame{NN}.txt`.

All 145 are here rather than a selection. They are near-duplicates by design —
the point of a scroll walk is that nothing is missed — and the evidence of the
rendering defect below is spread across them, so curating would have thinned it.

They are text, not images: this project renders its real `ChatView` through a
headless renderer, which is how every frame in `docs/roomyx/screenshots` was made.

## What the room found in the product it was reviewing

Both were found by participants doing their own work, not by the maintainer, and
both are real:

1. **`README.md` promises something the binary does not do.** It states in bold
   that a live room has exactly one writer and that `append` *refuses* when the
   registry shows a live room serving that log. It does not refuse — it prints a
   note and appends. Found by Jonas running it against this very room; confirmed
   independently against README lines 18 and 169.

2. **The wrap defect drops a character.** A word landing exactly on the wrap
   column loses its last character, and the character is not carried to the next
   line. Visible in these frames against the raw log: `calls` → `call`,
   `researcher` → `researche`, `exists` → `exist`, `That's not` → `That's no`.

   It was first reported here as "width 100 only", because at 72 those same words
   render intact. That framing is wrong and is corrected: different words break
   at different widths, so it depends on what lands on the boundary, not on the
   width. The repository carries a deliberate `test.failing` tripwire for this
   defect, which is upstream in `@opentui/core`.

## Rereading it

```bash
roomyx rooms history                    # the room is recorded as closed
roomyx-client --open <path>/room.jsonl  # reread it read-only
```
