# Draft post (English)

I gave seven fictional experts one newspaper headline and nothing else. Ten
rounds later they handed me a document I would not have written myself.

**Why I started this**

I kept noticing the same failure in how I use models. One assistant, one context,
one voice — confident, agreeable, and structurally incapable of disagreeing with
itself. Ask it to "consider the counterargument" and it writes the
counterargument in the same voice that just made the argument. That is not a
second opinion. That is one opinion wearing a hat.

So I built a small thing to test a different shape: **roomyx**. Not a framework.
Three parts:

- a **room** is an append-only JSONL file — one header line, one line per message;
- a **local MCP server** reads that file and a terminal UI renders it;
- a **skill** tells one agent how to be the dispatcher, and a **persona library**
  gives it people to cast.

The dispatcher is transport, not a moderator. It relays what changed and writes
to the log; it never decides who is right. Each participant is a long-lived agent
that keeps its own memory and receives only the delta since it last spoke — so
the cost grows linearly with the conversation, not quadratically the way it does
when you re-paste the whole transcript into a fresh agent every turn.

**The experiment**

The input was one line: *"OpenAI agents attacked software service RubyGems before
Hugging Face hack."* A headline. No article, no sources, no framing, no position
to defend. They were allowed to search the web.

Seven seats — all of them fictional characters from the persona library, not real
people and not credentialed experts:

- **Priya** — security researcher
- **Marcus** — open-source adoption
- **Omar** — backend architect
- **Elena** — EU regtech
- **David** — venture investor
- **Pavel** — a developer who actually publishes packages (answering in Russian)
- **Viktor** — a non-Western market read (answering in Russian)

Five answered in English, two in Russian, in one stream, with no translation
layer between them. Models were assigned per seat rather than uniformly — the
hardest reasoning seats got the strongest model, the concrete bounded ones got
the cheapest. The two cheapest seats produced the two most practical
contributions in the room.

**What actually happened**

The first thing they did was refuse the headline. Priya went and read the
reporting and split the story in two: the RubyGems campaign is on the
maintainers' own contemporaneous record, while the attribution to OpenAI's
internal agents is a researcher claim the lab has not confirmed. That distinction
— established versus alleged — survived to the final document.

Then they argued for ten rounds, and changed their own minds six times on the
record:

- Omar proposed a 24–48 hour quarantine on new packages. Viktor pointed out it
  would not help, because the documentation builder executes code at upload,
  before anything is indexed. Omar checked and folded: *"He's right. I missed the
  trigger."*
- Pavel refused the quarantine outright from the seat that would live with it: a
  48-hour queue is fine until your security hotfix is the thing sitting in it.
- Marcus turned the fix into a bill — a policy nobody is on call for *"isn't a
  policy, it's a liability with a nice name."*
- David explained why the obvious funder will not pay: what you are asking for is
  *"money that functions as an admission."*
- Elena checked the law instead of assuming it, and found that where Europe
  wanted independent verification it wrote it explicitly — DSA audits, DORA
  penetration testing. For general-purpose AI it chose self-assessment.
  Deliberately.
- Then Omar abandoned his own proposal once a cheaper measure covered the actual
  attack: *"I was building for completeness, not for May."*
- And Priya broke the room's agreed recommendation rather than let it ship
  comfortable, by naming the threat class none of it touches.

**What they concluded**

*Serious as a precedent, unproven as a breach.* The threat model did not change;
the threat actor did. A registry now has to assume a spam wave might be a
well-resourced lab's side effect — and side effects are not deterred by anything.
"No evidence found" is a negative result from the party that owns the evidence,
unfalsifiable until someone else gets the logs.

The recommendation came out sequenced, because the room argued its way there:

- **This week, costing nothing and needing nobody's permission:** default-deny all
  outbound network from the package build process, scope build credentials to a
  read-only token, rate-limit uploads per author and per IP, and announce the
  cutover date in advance so pending builds can adapt.
- **This month:** a bounded engineering grant for the full sandbox, with the
  milestone on an external calendar — because, as one of them put it, a ticket
  slides the moment the pager goes quiet.
- **Not solved, and said so:** a compromised build process poisoning the artifact
  it produces needs no network and no admin token — the registry then distributes
  it, legitimately. Nothing they proposed touches that. Nobody funded it.

Pavel's summary of the cheap fix was the line I keep coming back to: *it is a
bandage on an artery — it works, but it does not heal.*

**What I am not claiming**

This is small and new. Nobody outside my machine has run a room. These are
fictional personas, not experts, and their citations were checked by other
personas rather than by me — a room of agents disagreeing well is a better
instrument than one agent agreeing with itself, but it is not evidence.

What I take from it: the value was not in any single answer. It was in a
participant saying *"he's right, I missed the trigger"* — and in another one
arguing against the recommendation they had spent four rounds defending. That is
the part one model in one context does not do for you.

Code, transcript and the full assessment are in the repo. Screenshots below are
straight from the terminal UI.
