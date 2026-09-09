# TUI review — four reviewers against ten screenshots

*2026-09-09. Reviewers: Inés (design/hierarchy), Ken (accessibility/i18n),
Mira (CLI ergonomics), Paul (onboarding/support). Two rounds. The room's own
log is `docs/roomyx/screenshots/review-room.jsonl`; every screenshot referenced
below is in `docs/roomyx/screenshots/`.*

Each reviewer opened all ten images before speaking. Points that could not be
tied to a named screenshot were not taken.

## The ranked outcome

| | What | Why it is first/second/third |
| --- | --- | --- |
| **1** | **Scrolling.** Arrows, PgUp/PgDn, Ctrl-U/D, gg/G scroll the transcript; the roster gets `j`/`k` or Tab-focus. | Three of four ranked it first, and the fourth changed her vote to match. It is what people press before they read anything, and today it is the difference between "the tool works" and history you cannot reach. |
| **2** | **A permanent footer** — liveness, message count, keys — **in the same change as the rebind.** | Two reviewers arrived at the footer independently. Mira's objection is why it is second and not first: a footer is a keymap's confession, and shipping it alone prints `up/down move the roster` on the screen as documented behaviour someone will later defend. |
| **3** | **Transcript hierarchy.** Bright name, dim body, blank line between turns, hanging indent on wraps, collapse repeated same-speaker headers. | *"Scrolling without hierarchy is still a grey wall, but hierarchy without scrolling is a wall you can't leave."* — Mira |

## Status

All three shipped, and everything below the line with them: the modal is gone
and `Enter` now filters the stream in place, `/` searches with `n`/`N`, `?`
shows the full keymap, `w` writes what is on screen to a file, and the roster
gives up its gutter below 80 columns. Before-and-after
frames are `screenshots/long.png` → `screenshots/after-typography.png`,
`screenshots/narrow.png` → `screenshots/after-narrow.png`, and
`screenshots/empty.png` → `screenshots/after-empty.png`.

Two ideas came from a survey of other terminal UIs run alongside the review, and
both changed a decision rather than decorating one. **tig** has no follow-mode
flag at all: it tails while the cursor sits on the last line and stops when you
move off — so roomyx has no `Autoscroll: on/off` state that can disagree with
where the reader actually is. And **charm's crush** hides its sidebar outright
below a 120×30 breakpoint while **atuin** ships a `style = auto` that degrades on
a short terminal; that precedent is why the roster now disappears below 80
columns instead of merely becoming collapsible.

The wrap defect below is **not** fixed and deliberately not worked around — see
`test/client/wrap-defect.test.ts`.

## Two things the room agreed on that nobody proposed at the start

**The `[connected]` chip should go, and be replaced by a fact that moves.**
Inés opened by wanting it removed; Ken and Paul both wanted liveness *louder*.
The disagreement resolved into something better than either position. A word
that has always said the same thing stops being read, which is exactly why
`disconnected.png` fails — it differs from `long.png` by one word, in the same
ink, at the far left of a line that was already truncating. Print a message
count and the age of the last message instead. When the number stops moving,
the silence finally means something.

Inés conceded first, and the reason is worth keeping: *"Removing the chip would
have left a slot nobody had ever seen occupied, which is worse than a chip that
at least teaches the location."* Her rule survived in inverted form.

**State changes must also enter the transcript as ordinary text.** Ken's, and
the only point no one else came near: a status row repainted at a fixed
position, with the cursor parked in another pane, is never spoken to a
screen-reader user. It is invisible in the way that matters. A line like
`— disconnected, retrying, last message 14s ago —` written into the stream
lands in speech, in scrollback and in a `tee`'d log at once. He also asked for
a key that re-emits current state on demand, *"because you cannot glance at
something you cannot see."*

## Verified defect found during the review

**A word that ends exactly at the wrap column loses its last character.**

Reproduced headlessly at 72 columns of terminal with a 24-column roster, so a
48-column message area:

```
Théo: Continuing the thread on whether scrollin
or empty states ship first, with enough text on
```

The source text reads `whether scrolling or empty`. The `g` is gone — not
wrapped to the next line, not replaced by an ellipsis, gone. Independently
observed in a real terminal through tmux at 72 columns, where
`Continuing the thread on whether` rendered as `Continuing the thread o whether`.

Not fully characterised: at 108 and 120 columns the same message reconstructs
exactly, so the trigger is the word landing on the boundary rather than the
width itself. Filed as-is rather than guessed at — the earlier hypothesis that
the vertical scrollbar was eating a column was measured and is **wrong**: the
loss happens with three messages and no scrollbar just as it does with sixteen.

This is the only correctness bug in the set. Everything else is layout or
interaction.

**Left unfixed on purpose.** The obvious workaround — a one-column right margin
on the body — was measured: the text then reconstructs at 60, 72, 108 and 120
columns and still loses a character at 90. It moves the boundary rather than
removing the cause, which would turn a reproducible defect into an intermittent
one and make it much harder to find later. `test/client/wrap-defect.test.ts`
holds the reproduction as a `test.failing` tripwire, so the day the wrapping is
fixed upstream the suite says so instead of leaving a workaround in place
forever.

## Below the ranked three

- **Kill the fixed 24-column roster** rather than making it collapsible. Mira
  moved to this position after Ken's argument: `Théo` fits in 24 columns,
  `Владислава Мирославовна` does not, and three CJK characters are six cells,
  not three. Collapsible assumes the column is right and only occasionally in
  the way. A full-width stream with the roster as an overlay also removes the
  `tee` problem, because no row would hold two panes.
- **The modal is the wrong shape.** `modal.png` is a mostly-empty box over
  eighteen ruled blank rows, covering the roster it was opened from, with no
  scroll, no next-participant and no hint that Escape exits. What "show me this
  participant" wants is a filter on the stream — Enter filters in place, `Esc`
  clears, composing with scroll and search. *Done: `AgentModal` is deleted;
  see `screenshots/after-filter.png`.*
- **`o` is a stolen key.** `o` means *open* nearly everywhere; `:` is free and
  already means "I am about to type a command". Also, `prompt.png` shows the
  mode line replacing the status bar, so the goal disappears at exactly the
  moment you are typing a command about the goal.
- **Selection has to mean something visible.** `scrollup.png` differs from
  `long.png` by a single caret after four keypresses.
- **Empty states need words, not emptiness.** `empty.png` is a healthy
  connected room seconds after start; the conclusion a person draws is "it
  hung", and they are wrong. `modal.png` repeats it: `— last seen at seq 0`
  over blank rows reads as a broken render rather than "he has not spoken".
- **Deferred by the reviewer who raised them:** wide characters, RTL, full
  screen-reader semantics. Ken ranked these below the text-event fix himself.

## What this review does not cover

Colour was reviewed from screenshots rendered by a converter I wrote for this
purpose. The converter maps the terminal's SGR codes faithfully — and the
finding that the UI is monochrome is independently checkable in the raw
captures, which contain only colours 15, 247 and 235 — but hue accuracy in the
PNGs is mine, not the terminal's.
