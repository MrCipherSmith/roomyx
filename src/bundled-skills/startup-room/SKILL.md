---
name: startup-room
description: Runs a persistent multi-persona discussion/brainstorm room cheaply — each persona is spawned once as a named subagent and kept alive across turns via SendMessage (so it remembers its own history instead of re-reading the whole transcript every time), every message is broadcast to every participant (not just @-addressed ones), participants self-moderate against tunneling too deep into one narrow thread, and the full dialogue is logged verbatim to a shared markdown file the participants never write to directly. The room is goal-driven, not round-driven: it runs until an explicit, measurable goal is met (by default, for startup-idea rooms: find an idea, score it against a 50-criteria rubric, and reach participant convergence) or the owner stops it — not until some fixed number of turns has elapsed. Use whenever the user wants several persona/character subagents (founders, experts, interview personas, judges) to discuss, debate, brainstorm, or interview each other over multiple rounds toward a concrete goal, especially when they've asked for this to be done without burning tokens by re-pasting the whole conversation into a fresh agent each round.
---

# Startup Room

A reusable pattern for running a multi-agent "room" — several distinct persona subagents holding a real, evolving group conversation toward an explicit goal — without the token cost of re-sending the full transcript to a brand-new agent every turn.

## Why this exists

The naive approach (spawn a fresh `Agent` call each turn, pasting the entire cumulative transcript into the prompt so the agent has context) burns tokens quadratically: transcript size × number of remaining turns. This skill fixes that by keeping each persona as one long-lived agent that remembers its own history natively, and only ever receiving the *delta* (what's new since it last spoke).

## The goal contract (mandatory)

A room without an explicit, checkable goal degenerates into an open-ended chat that never actually concludes anything — this was an observed failure mode, not a hypothetical. Every room must be created with:

1. **A goal statement** — what the room is *for*, in one sentence (e.g. "find a startup idea and defend it" / "pick the best of these 3 architectures" / "interview this candidate and reach a hire/no-hire call").
2. **Explicit, measurable success criteria** — a checklist or scoring rubric the candidate output must pass, decided *before* spawning participants, not invented after something looks good. See **Goal type: find & defend a startup idea** below for the default criteria set this skill ships with for that specific goal; other goal types need their own criteria stated up front the same way.
3. **A convergence requirement** — passing the criteria on paper is not enough; the room's own participants must explicitly agree the candidate is the pick. A high score with participants still arguing is not a completed goal.

The room is **goal-driven, not round-driven**: there is no fixed number of rounds. It keeps looping — search, propose, defend, score, converge — until either (a) a candidate passes the criteria *and* the room converges on it, or (b) the owner explicitly stops the room (out of patience, budget, or a decision that no candidate is good enough). Running out of obvious new ideas without reaching (a) is a legitimate status to report honestly — it is not a signal to quietly lower the bar or declare victory on a candidate that didn't actually pass.

## Roles in this pattern

- **The dispatcher** — you (the orchestrating Claude instance). Your job is transport, not judgment: relay deltas, append to the log, spawn new participants when told to. You never let participants write to the shared log file themselves; you are the only writer. This is a deliberate safety choice: it guarantees nothing gets deleted or corrupted by a subagent, and it lets you enforce formatting and catch a participant going off the rails before it's committed to the record. See **Dispatcher discipline** below — this role is narrower than it sounds, and it is easy to accidentally overstep it.
- **The participants** — one persistent named subagent per persona. They decide everything substantive: what to research, whether an idea is good, when to pivot, who should speak next, when to converge. This is the actual point of the room — if you (the dispatcher) are making these calls instead of them, the room has stopped being a room.
- **The session owner** — the human running the session. They can inject an instruction at any point (a veto, a new constraint, a topic to explore, a request to add participants, a reminder like "we're a small startup"). See **The owner-injection channel** below for how this differs from a participant's suggestion.
- **The log file** — a single markdown file (e.g. `<project>/brainstorm/<topic>-room.md`) that is the append-only source of truth for the whole session.

## Dispatcher discipline (the easiest way to break this pattern)

The dispatcher's job looks like a moderator's job but is actually much narrower. In practice, the strongest pull is to start *directing* — assigning specific research questions to specific participants, synthesizing conclusions before the room has, deciding which candidate to pursue next. Every one of these is a real failure mode observed in practice, not a hypothetical:

- **Don't assign research tasks.** Relay the delta ("here's what happened since your last turn") and stop there — let the participant decide whether to research, argue, ask someone else a question, or pass. Composing a specific question for them to answer ("please check X, Y, Z") is you doing their job.
- **Don't synthesize verdicts for them.** If Grace and Elena need to independently converge on whether an idea survives, let their own words do that — don't write "the room concludes X" until participants have actually said so.
- **Don't pick the next direction.** If the room hits a fork (which candidate to pursue, whether to pivot), relay the fork to participants and let them argue it out — including disagreeing with each other. Your log entries should record who decided what, not you deciding on their behalf.
- **Do relay a stalled thread's obvious next question** (e.g. "Grace asked Sam a direct question, he hasn't answered yet — send it to Sam") — this is transport, not judgment, because the question already exists in the transcript.
- **Self-check each turn:** if your message to a participant contains a specific instruction they didn't ask for and no one in the room raised, you've drifted from dispatcher into director. Rewrite it as a neutral delta + open prompt.

This discipline was learned the hard way mid-session: the dispatcher spent several rounds assigning bespoke research questions to each participant, effectively running the investigation *for* the room. The session owner corrected this explicitly ("не ты их направляешь, они сами друг друга... в этом смысл"). The fix held for the rest of the session and produced better, more surprising results — participants caught things a directed investigation would have missed (e.g. one participant refusing to trust their own confident technical claim until a colleague pressure-tested it).

## The owner-injection channel

The session owner is not a participant, and their messages are not "just another opinion" to be relayed on equal footing — they carry standing authority the room cannot vote down. When the owner sends an instruction mid-session, handle it distinctly from ordinary dispatch:

- **Vetoes are final, not negotiable.** If the owner says a direction is closed (e.g. "this is too heavy for a small startup, drop it"), relay it as a closed decision to the participant(s) working that thread — not as a question for them to weigh in on. They can react (and often will, gracefully — e.g. proposing what to do instead), but the veto itself isn't up for debate.
- **Constraints apply retroactively and going forward.** A reminder like "we're a small startup" should be relayed to whoever is currently evaluating open candidates, framed as: re-assess what you already found under this lens, not just apply it to future ideas.
- **New topics/scope changes come from the owner, not from you.** If the owner says "look at IT trends broadly, not just AI," that reframing is theirs — relay it as their explicit ask, don't quietly narrow or widen scope yourself.
- **Requests to add participants** are handled via the mid-session spawn pattern below.
- **The owner can edit the goal contract itself** (tighten/loosen the threshold, add a "must also" criterion, change the goal entirely) — this is a goal-injection, distinct from a veto on content. Relay it to the room as an authoritative update to what "done" means, and re-run the scoring/convergence check under the new terms if a candidate was already mid-evaluation.
- **Status requests ("what's happening in the room?") get a real status, not a decision.** Report what's been found, who's arguing what, what's still open — do not use the opportunity to steer. If the owner explicitly asks "which should we pursue," that's their call to make (possibly by asking the room, via you), not yours to answer.
- **Owner instructions may also arrive over roomyx.** If you started a room server and attached a dispatcher handler to it, a veto / constraint / add-participant / goal-edit posted through `room.post_owner_command` is an owner injection exactly like one typed in chat — same standing authority, same handling as above. It reaches you as a command to act on; roomyx itself never writes to the log.
- **Do not ask the owner "what should we do next" as your default move.** Once the room's goal is set, keep it running and report status; only surface a genuine fork to the owner if it's a decision only they can make (scope, budget, willingness to accept a risk) — not a decision participants should be making themselves.

## Mid-session participant addition

The room doesn't have to be fully cast before it starts. To add a participant partway through:

1. Write their persona profile file first if it doesn't exist yet (same neutral-biography convention as the rest of the roster — see the project's persona-writing convention if one exists).
2. Spawn them with a **condensed** recap of what's happened so far (not the full transcript — summarize the arc: what's been explored, what's been killed and why, what's currently live) plus the full current roster (names + one-line role of everyone, including the other new joiners arriving alongside them).
3. Give them the same broadcast/self-moderation rules as original participants, and ask for an opening reaction — they should react to the *substance* of what's happened, not just announce themselves. A good new joiner brings a genuinely different angle (a different market, a different domain, a skeptical read on an existing thread) rather than restating what's already been said.
4. Log their contribution like anyone else's, and update the roster reference in the log file header.

This works well for deliberately broadening a room's perspective (e.g. a US-centric room that needs non-US market voices) — inject 2-3 new participants at once with an explicit ask to bring the missing angle, not just "join the discussion."

## Goal type: find & defend a startup idea (default criteria)

This is the default, ready-to-use goal type for this skill. When the owner asks to "find a startup idea," "find and defend an idea," or similar, use this criteria set unless they specify otherwise or the project has its own rubric file (check for one, e.g. `<project>/ideas/scoring-rubric.md`, and prefer it if present and more current — the list below is the portable default this skill carries so it works standalone in any project).

**Goal statement:** find a startup idea, and defend it until it (a) scores ≥60-70% on the 50-criteria rubric below, and (b) every active participant explicitly backs it as the room's pick.

**The 50-criteria rubric** — score each 0-10, sum out of 500, report as a percentage. Threshold: **60-70% (300-350/500)** to be "seriously considered." Below that is a real fail, however good the idea sounds in conversation.

**A. Боль и спрос (pain & demand) — 1-8**
1. Боль подтверждена цифрами, не догадкой · 2. Частота возникновения боли · 3. Острота боли (цена НЕ-решения) · 4. Размер затронутой аудитории · 5. Боль растёт со временем (тренд) · 6. Осознаваемость боли самим страдающим · 7. Стоимость текущего обходного пути · 8. Источник данных о боли независим от продавца идеи

**B. Рынок и конкуренция — 9-16**
9. Конкуренция реально пуста после жёсткого поиска · 10. Качество существующих решений · 11. Защитимость (не скопируют за спринт) · 12. Риск, что крупный игрок зайдёт намеренно · 13. Фрагментация рынка · 14. Траектория конкурентов (растут/буксуют) · 15. Издержки переключения клиента · 16. Временное окно возможности имеет чёткую дату, не расплывчатое "скоро"

**C. Экономика — 17-24**
17. Готовность платить подтверждена, не гипотетична · 18. Реалистичный ценовой потолок на клиента · 19. Размер адресного рынка именно для этой ниши · 20. Юнит-экономика (CAC/LTV хотя бы оценочно) · 21. Повторяемость дохода (подписка vs разовая) · 22. Ясность модели ценообразования · 23. Устойчивость маржи к росту стоимости входов · 24. Скорость цикла продажа→первый доход

**D. Реализуемость — 25-32**
25. Соло-подъёмность MVP (недели vs годы) · 26. Технический риск/предсказуемость · 27. Зависимость от партнёрств/данных третьих лиц · 28. Скорость получения рыночной обратной связи · 29. Требуемая доменная экспертиза · 30. Зависимость продаж от личных связей/доверия · 31. Доступность данных для AI-компонента (если применимо) · 32. Реалистичная оценка времени до первой сделки

**E. Риски — 33-40**
33. Регуляторный/юридический риск минимален · 34. Независимость от чужой платформы/API · 35. Риск изменения политики платформы/вендора · 36. Ответственность/репутационный риск при ошибке · 37. Чувствительность к макроэкономике/сезонности · 38. Личный юридический риск для фаундеров · 39. Геополитическая/юрисдикционная хрупкость · 40. Риск единой точки отказа

**F. Дистрибуция и рост — 41-46**
41. Можешь ли ты реально продать именно в этот сегмент · 42. Тёплый путь к первому платящему клиенту · 43. Виральный/реферальный потенциал · 44. Founder-market fit · 45. Повторяемость GTM на новые сегменты/страны · 46. Готовое сообщество/экосистема, на которую можно опереться

**G. Долгосрочная устойчивость — 47-50**
47. Защитимость за пределами первого узкого клина · 48. Опциональность расширения в смежные звенья цепочки · 49. Ценовая власть со временем · 50. Реалистичный путь к экзиту, или устойчивость как bootstrap-бизнеса

**How to run the scoring gate:** see **Scoring & convergence protocol** below — do not treat "the room seems to like this idea" as equivalent to a passed gate.

## Archiving a finding mid-session

When the owner says "save this idea" (or a candidate clearly survives enough rounds to be worth keeping regardless of whether the room keeps exploring), write it to a dedicated file *outside* the raw transcript — e.g. `<project>/ideas/<idea-name>.md` — with: the core pitch, the "why now" trigger, the strongest supporting evidence with sources, the competitive landscape found, open questions still unresolved, and which participants found what. Do this instead of letting the idea's evidence live only buried in a long transcript. Then explicitly tell the room to keep going — archiving isn't the same as concluding, and a room that just landed a good finding is prone to a "victory lap" where everyone relaxes instead of continuing to search (one participant in practice named this risk explicitly and it's worth watching for).

## Setup

1. Identify the persona profile files to use (e.g. `arena/roles/**/*.md` or a subset). Each profile should already be a neutral biography/expertise sheet — no pre-baked opinions or conclusions (see the project's persona-writing convention if one exists).
2. Write the **goal contract** (see above): goal statement, success criteria (default to the 50-criteria rubric for a startup-idea room), and the convergence requirement.
3. Create the log file with a header: the goal contract in full (not just a one-line goal — include the criteria/threshold so anyone reading the log later can check whether it was actually met), list of participants (name + one-line role), and the ground rule that only the moderator writes to it.
4. Decide the opening framing. If the task is "find something from scratch," say so explicitly and do NOT hand participants a pre-built brief that narrows their options — that biases the room before it starts. The criteria are the bar the eventual candidate must clear, not a hint about what kind of idea to look for.
5. If roomyx is available for this project — a `.roomyx/` directory exists, or `roomyx` resolves on `PATH` — start a server for the log so the owner can watch the room live. See **Watching the room live (roomyx)** below. If it isn't available, skip this step and run the session exactly as you would otherwise; nothing here depends on it.

## Watching the room live (roomyx)

A room's transcript is a file the owner can only read after the fact. roomyx
turns it into something they can watch while it runs, without changing how the
room works: it reads the log and serves it, and it never writes to it. The
dispatcher stays the log's single writer.

Start the server as part of setup, before the kickoff spawns:

```bash
roomyx serve <logPath> --port 0
```

`--port 0` takes an ephemeral port, so several rooms can run at once without
colliding. It prints the bound URL and a short room ID:

```
roomyx serving /abs/path/room.md at http://127.0.0.1:41235/mcp
room ID: r-a1b2c3 — attach with `roomyx-client --room r-a1b2c3`
```

**Relay that room ID to the owner in the kickoff confirmation, with the attach
command.** That is the whole point of starting it — the owner opens the room in
a second terminal and watches the discussion as it happens instead of waiting
for your status reports. `roomyx rooms list` shows what is actually running;
each entry is confirmed with a real call, not just read out of the registry.

Attaching, detaching, or closing that terminal does nothing to the room. If the
owner never attaches, the session is unaffected.

Stop the server with `SIGINT`/`SIGTERM` when the room ends — it removes its own
registry entry on the way out. A server killed outright leaves a stale entry,
which is harmless: the next `rooms list` prunes it after a liveness check.

## Kickoff (spawn once per persona)

Spawn each participant as a separate `Agent` call (`subagent_type: general-purpose`, tools available as needed — allow `WebSearch`/`WebFetch` if the room is expected to ground claims in reality, not just riff). The kickoff prompt for each must include:

- Instruction to read their own profile file and fully embody that character.
- The room's goal, stated neutrally, **and the concrete success criteria/threshold** — participants should know from turn one what "the room succeeded" actually means (e.g. "we're looking for an idea that would score ~300+/500 on the 50-criteria rubric and that all of us would personally back — not just something that sounds exciting").
- The full initial roster (names + one-line role of every other participant), so they know who they're in the room with.
- **The broadcast rule, stated explicitly:** "You will receive updates containing everything said by every participant since your last turn — not just messages addressed to you. Read all of it. You may address someone specifically with @Name, but @-addressing is just a convention for clarity in the transcript, not an access filter — you already see everything regardless."
- **The self-moderation instruction, stated explicitly:** "You and the other participants are jointly responsible for not letting the discussion tunnel too deep into one narrow technical thread too early. If you notice this happening — including in your own last message — say so and propose broadening back out. Anyone can call this out, not just a designated moderator persona."
- Whether real web research is expected/required this round (say so plainly; don't leave it ambiguous).
- Ask for their opening contribution (a pitch, a reaction, a question — whatever fits the room's stated purpose).

Capture the `agentId` (or assigned name) returned by each spawn — this is what you'll use with `SendMessage` for every subsequent turn. Log each opening contribution to the file, in dialogue form (`**Name:** their actual words`), as it comes in.

## Turn loop

For each subsequent turn:

1. Decide whose turn it is. Options: round-robin, or reactive (whoever was just @-mentioned or most directly challenged goes next), or "whoever has something to add" if you asked participants to signal that. Mix these — a real room isn't strictly round-robin.
2. Compose the delta: only the messages posted since that participant's last turn (typically: everything since you last messaged them). Do not re-paste anything they already said or already received — they remember it.
3. Send it via `SendMessage` to their `agentId`/name, with a short prompt: "Here's what's happened since your last turn: [delta]. Your turn — react, build, refute, research, or pass."
4. Append their reply verbatim to the log file, prefixed with their name.
5. Report to the session owner after essentially every substantive exchange, not just every few turns — in practice, "frequent" means after each participant's reply that adds something new, not on a fixed cadence. Use real quotes from the transcript, not paraphrases, so the owner can judge the room's reasoning quality directly. If the owner has explicitly asked for frequent updates, treat that as the floor, not a suggestion to pace yourself against.

**Mechanical note:** `SendMessage` to a previously-spawned agent runs it in the background and returns immediately; the agent's reply arrives later as a separate task-notification event, not as this tool call's return value. Don't block waiting for it — end your turn, and act on the reply when the notification arrives. Multiple participants can be messaged in parallel this way; their replies will arrive as separate notifications, in whatever order they finish.

## Scoring & convergence protocol

Once a candidate has survived enough open debate that participants seem to be converging on it, do not declare the goal met on vibes. Run an explicit gate:

1. **Formal scoring pass.** Either assign the full criteria list to one rigorous participant to walk through point-by-point with justification and sources (as has worked well in practice — one skeptical persona producing a full numbered scorecard), or split the criteria groups across 2-3 participants for independent scoring. Log the score, the percentage, and whether it clears the threshold — verbatim, including the reasoning per group, not just the final number.
2. **If it fails the threshold:** this is real, useful information, not a setback to paper over. Report the score and the weakest groups honestly, then relay back to the room: does this get refined (same idea, address the specific weak criteria) or abandoned (back to search)? That's the room's call, not the dispatcher's.
3. **If it clears the threshold:** run an explicit convergence turn — ask each active participant a direct, individual question: "This idea scored X% against the criteria. Do you personally back it as the room's pick — yes, no, or yes-with-reservations?" Collect actual individual answers, not a paraphrased summary.
4. **The goal is only met when both conditions hold**: score ≥ threshold *and* the room has converged (unanimous, or an owner-defined quorum if the owner has said unanimity isn't required). A high score with an unresolved direct challenge between two participants (e.g. one hasn't answered another's pointed question yet) is not convergence — relay the open question and wait for it to resolve.
5. Once met, write the final archive entry (see **Archiving a finding mid-session**) explicitly noting the score and that convergence was reached, and report completion to the owner as the goal being achieved — not just "an idea was found."

## Loop until the goal is met

There is no fixed "end of session" — the room's natural rhythm is: search → propose candidate(s) → open debate → (repeat until something looks worth formally testing) → scoring & convergence gate above → either goal met (stop) or gate failed (loop back to search/refine, goal contract unchanged unless the owner edits it).

Within that loop, still close individual rounds cleanly so status is checkable at any point:
- An explicit "where do things stand" turn (ask each active participant for a one-line current position) if a natural pause point is hit before a formal scoring gate is warranted, or
- A moderator-written synthesis that honestly reports non-convergence/non-consensus if that's what happened — do not manufacture a fake consensus, and do not let a partial or informal sense of agreement substitute for the actual gate above.

Formalize any intermediate outcome (a short brief, not the raw transcript) if it's meant to feed into a next round — raw transcripts are expensive to re-read; briefs are cheap. This is separate from, and does not substitute for, the formal scoring/convergence gate required to declare the goal met.

## Things to avoid

- Do not let a "kill the same idea seven ways" cycle run past the point of diminishing returns — if independent participants converge on the same verdict from different angles, stop and move on rather than collecting a ninth confirmation.
- Do not silently switch a room's stated task (e.g. "adversarially test idea X" quietly becoming "keep re-litigating idea X forever" instead of pivoting to searching for a new idea once X is dead) — check back against the room's actual stated goal each round.
- Do not give participants write access to the shared log file, even read-only tool access that could be misused — the moderator relays and appends, always.
- Do not declare the goal achieved without running the explicit scoring & convergence gate above — "the room seems excited about this" or "several participants like it" is not the same as a passed threshold plus an actual individual yes from everyone.
- Do not quietly lower the threshold or narrow the criteria because nothing is passing — if the room is genuinely stuck, report that honestly to the owner as a status (goal not yet met, here's why) rather than softening the bar to manufacture a win.
