# Notes from the run — for a write-up

Kept while the room ran, not reconstructed afterwards.

## What the stand actually is

Three things, and none of them is a framework:

- an **append-only JSONL log** — one `state` header, one line per message;
- a **local MCP server** that reads that log and exposes it, plus a terminal UI
  that renders it;
- a **skill** that tells an agent how to be the dispatcher, and a **library of
  people** for it to cast from.

That is the whole stand. `roomyx room new`, `roomyx serve`, `roomyx room append`.
A room is a file; everything else reads it.

## What this run demonstrated that the previous one could not

- **Seven participants, two languages, one conversation.** Five answered in
  English, two in Russian, and the deltas were relayed untranslated in both
  directions. Nobody waited for a translation and nobody split into two rooms.
  Viktor's objection to Omar crossed the language boundary intact and changed
  Omar's mind.
- **Models chosen per seat, not uniformly.** Two on opus where the reasoning was
  hardest — EU law and the non-Western read; three on sonnet; two on haiku where
  the contribution was concrete and bounded. The haiku seats produced the two
  most practical contributions in the room: the man who refuses the quarantine
  and the one who reduced it to a mechanism.
- **The room changed its own mind six times, on the record.** Priya conceded her
  framing to Marcus. Omar conceded a mechanism error to Viktor and corrected his
  proposal. David conceded half a point to Viktor about which market moves.
  Then, later and harder: Omar abandoned his own proposal once a cheaper measure
  covered the actual attack; Priya broke the room's agreed recommendation by
  naming a threat class none of it touches; Viktor drew a conclusion against his
  own market rather than claim a win. Those reversals are in the log with
  `in_reply_to` pointing at what caused them.
- **Ten rounds, thirty-six messages, and the last four rounds were the useful
  ones.** The room stopped discussing the news around round five and started
  taking apart a mechanism. The final assessment is sequenced — what a registry
  does this week, what it does this month, and what it still cannot do — because
  the room argued its way there, not because anyone asked for that shape.

## The moments worth quoting

- Viktor, catching the flaw nobody else saw: the May compromise did not run
  through a user installing a package, it ran through the documentation builder
  executing code at upload time — so quarantining *visibility* changes nothing.
- Omar, checking and folding: "He's right. I missed the trigger."
- Marcus, turning a safety recommendation into a bill: "we're prescribing labour
  we're not offering to pay for."
- David, on why the labs will not fund the fix: "money that functions as an
  admission."
- Elena, on why waiting for regulation is a category error: where Europe wanted
  independent verification it wrote it explicitly — DSA audits, DORA
  pen-testing. For general-purpose AI it chose self-assessment, deliberately.
- Omar, abandoning the proposal he had spent four rounds defending: "Priya is
  right. Default-deny network closes the May vectors entirely... I was building
  for completeness, not for May."
- Priya, breaking the room's own recommendation rather than let it ship
  comfortable: default-deny and a scoped token close exfiltration, but "they
  don't touch the class that matters most — a compromised build process
  poisoning the artifact it produces... the registry distributes for the
  attacker, legitimately."
- Viktor, conceding the EU procurement route to Elena and then refusing to
  present his own jurisdiction as the better one: a buyer bound by no exhaustive
  list refuses faster, but refuses blind — «он не производит истины, он
  производит отказ».
- Pavel, on what a cheap fix is worth: «это как повязка на артерии: работает, но
  не заживляет».
- David, on why the temporary fix becomes the permanent one: "I've watched a
  security fix ship as 'temporary' and outlive three CTOs... A dated check is a
  real control only if it's on someone else's calendar, not the firefighter's."

## The screenshots

Ten frames in `screenshots/`, captured headlessly through the real `ChatView`
with `createTestRenderer` at 120×34 — the same code path a terminal runs, not a
mock. They read in order: the cast and the goal before anybody speaks, then the
opening research, the bilingual seam, the two concessions, the refusal, the vote
round, the retraction, and the closing assessment.

One caveat that belongs in any post using them: **the viewer drops a character
at some wrap boundaries** and it is visible in the frames — `over 2,00 packages`
where the body says `2,000`, `натянули ег` where it says `его`. That is a defect
in the terminal library, not in the log; the stored message is intact. It is
pinned by `test/client/wrap-defect.test.ts`, written with `test.failing` so it
starts failing the day it is fixed upstream, and deliberately not worked around —
the measured workaround moved the boundary instead of removing the cause. Say so
rather than cropping around it.

## What is honest to say about the tool

It is four days old and it is one person's. The parts that are real: the log is
append-only with locked `seq` allocation and that is tested; the server refuses a
log it cannot read; a closed room is recorded and can be reread; every rendering
defect it has shipped is pinned by a test, including one it does not own and
deliberately does not work around.

The parts that are not: nobody outside this machine has run a room. The writer
guard does not engage for the agent workflow, and the README now says so rather
than claiming otherwise. Whether the 50-criteria rubric predicts anything has
never been measured.

A write-up that claims more than that would be the same failure the room spent
the evening naming in someone else.
