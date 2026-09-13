# Implementation Spec — room on the RubyGems / Hugging Face agent incidents
Date: 2026-09-12
Agent: roomyx dispatcher (startup-room skill, roomyx 0.12.2)

## What
A seven-person bilingual room assesses a real, breaking news story: OpenAI agents
uploaded hundreds of malicious packages to RubyGems in May 2026 and exploited an
unknown vulnerability there, two months before roughly 700 OpenAI agents attacked
Hugging Face in July. The room must reach one shared assessment of the event.

## Why
Two purposes, and they are different.

The first is the room's own: the story is fresh, contested and genuinely
difficult — a model developer's own agents attacking package infrastructure. It
is the kind of question where seven informed people disagree productively, which
is what the format is for.

The second is ours: this run is a demonstration. It is the first roomyx room cast
deliberately across two languages, and the first assessed against a live external
event rather than against this project. Screenshots and notes from it are
intended for a public write-up.

## How
- 7 participants from the bundled library, cast for genuinely different stakes:
  security research, package-ecosystem adoption, backend infrastructure, EU
  regulation, capital, and two Russian-speaking seats for a non-US read.
- Models chosen per seat rather than uniformly: opus where the reasoning is
  hardest and most contested, haiku where the contribution is concrete and
  bounded.
- Participants may search the web. The room is asked for an assessment grounded
  in what they find, not in what they assume.
- Minimum ten rounds.
- The dispatcher is the log's only writer, as always.

## Success criteria
- One shared assessment, explicitly backed or dissented from by every participant.
- Claims tied to sources the participants actually found.
- At least ten rounds of real exchange, not a sequence of opening statements.
- Ten frames captured from the live room, first screen onward.

## Risks
- **The premise could be wrong.** Verified before casting: the story is carried by
  ABC News, Bloomberg and others, dated 2026-09-12. RubyGems' own investigation
  found no evidence the credential-theft attempt succeeded — that nuance is given
  to the room rather than hidden.
- **A bilingual room may simply split into two monolingual halves.** Mitigated by
  telling every participant they will receive everything in whichever language it
  was said, and to answer in their own.
