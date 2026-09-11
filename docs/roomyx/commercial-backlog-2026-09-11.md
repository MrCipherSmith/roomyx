# Making roomyx commercial as well — the room's list, 2026-09-11

Produced by a five-person review room (`r-rocaap`, log in
`.roomyx/rooms/logs/roomyx-review.jsonl`). The room first settled the prior
question — **is this worth continuing** — five of five: a
**reputation-and-portfolio asset**, not a commercial bet and not neither. Ben
opened arguing it should stop and moved on David's reasoning, not on pressure.

The owner then extended the goal: what would make it commercial *as well*, with
the reputational value kept rather than traded away.

Items are grouped by what they cost, because the room's sharpest disagreement was
about cost, not merit.

## The disagreement worth keeping

Everyone produced a list. Ben's contribution was to say which item eats the year,
and he named David's:

> Jonas wants to drop Bun and ship reports — weeks at most. Theo wants Node
> alongside Bun — a day or two. But David wants twenty rooms run by people who
> are not the author, outcomes against known results, the rubric calibrated and
> published. That is not work you hire a developer to do. That takes a year. And
> it has to happen before any of the others matter.

He then named the thing nobody else raised: **validation**. The rubric and the
method were designed by one person for one purpose. Whether they generalise, and
whether they predict anything, has not been asked. David's proposal requires that
answer; Jonas's persona packs assume it.

Sam independently made the same cut from the other side: a room of fictional
personas has no standing as audit evidence, and selling it as one gets laughed
out of a security committee. His reframe — sell it as *pre-mortem rehearsal* to
the person building the case, not to the committee — is the same idea surviving
contact with reality.

## Days

- **Ship a compiled Node build alongside the Bun source** (Theo). `dist/` from
  tsc or esbuild, Bun kept for dev and test. No architecture change; it removes
  the first thing that stops a stranger. A day or two. Theo verified the code
  uses no Bun-native APIs — the dependency is the zero-build-step packaging
  choice, not the product.
- **Translate the persona library** (Jonas). 87 files, all in Russian, on global
  npm. A weekend plus a review pass.
- **Print what a room cost** (Jonas). Message count against an estimate. "That
  number is what decides whether I run one, and right now I'm guessing."
- **Split the persona corpus into its own MIT package** (David). Free and
  zero-friction: it is the reputational asset, and giving it away harder is how
  it recruits.

## Weeks

- **`roomyx report <room>`** (Jonas, David). One command, one self-contained
  file: goal, verdict, who backed it, who dissented and why, per-participant
  threads. Both arrived at this independently and it is the item with the most
  agreement in the room. "I can bill for a decision document; I cannot bill for
  a terminal."
- **Hash-chain the log, and embed the terminal hash in the report** (Sam). The
  log is append-only but *not tamper-evident* — nothing stops a re-exported memo
  from differing from the transcript. Each line's digest includes the previous
  line's. This is the single piece of real compliance value already sitting in
  the codebase, unclaimed.
- **`roomyx replay --diff` as a public command** (Theo). The fold over an
  append-only log is good audit infrastructure that is currently locked in a dev
  script.
- **Paid persona packs over an MIT core** (Jonas, amended by Sam). Content, not
  code: no server, no subscription, no support burden. Sam's amendment is
  load-bearing — sell rehearsal, not verdicts.

## A year, and it gates the rest

- **Validation before commercialisation** (Ben). Publish a decision plan with a
  timeline and a success bar. Do not build commercial models on an unvalidated
  core.
- **Calibrate the rubric** (David). Thirty companies whose outcomes are known;
  publish the hit rate. "A panel is worth what its scores predict, and that is a
  data asset no competitor can fork."
- **Twenty rooms run by people who are not the author** (David). His own
  precondition for writing a cheque, alongside one documented case where a
  verdict changed a decision.
- **A release cadence** (Ben). Twenty-eight publishes in seventy-two hours reads
  as debugging in production. "It does not mean ship less; it means a commercial
  product has a heartbeat."

## Explicitly rejected, by more than one person

- **Auth and SSO.** David: "hardening for an enterprise that is not asking is how
  this dies busy." Sam agreed and improved the reason: the buyer never touches
  the running server — they buy a memo. Theo: D-06a's own logic ties the absent
  token to loopback-only, so this is not a flag, it is reopening the trust model
  from zero.
- **A hosted version.** Jonas: "this thing refuses non-loopback binds on purpose.
  Growing a server eats six months and trades away the only thing we agreed it
  has."
- **Selling a procurement panel as audit evidence.** Sam: real vendor review runs
  on SIG questionnaires, SOC 2 and a named human. "Nobody accepts roleplay as
  audit evidence."

## Not on this list, on purpose

The two defects the room found are fixes, not ideas, and were kept out so they
could not pad it:

1. `README.md` promises in bold that `append` refuses when a live room serves the
   log. It does not — it warns and proceeds. Found by Jonas running it;
   confirmed against README lines 18 and 169.
2. The wrap defect drops a character from any word landing on the wrap column.
   Reproduced live in this room's own frames at two widths — `calls` → `call`,
   `researcher` → `researche`, `That's not` → `That's no`. It is not
   width-specific as first reported; it depends on what lands on the boundary.
