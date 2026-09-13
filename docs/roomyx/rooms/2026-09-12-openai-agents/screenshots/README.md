# Frames from the run

Captured headlessly at 120×34 through the real `ChatView` — `createTestRenderer`
plus `captureCharFrame()`, the same render path a terminal drives. Each file is
one screen of the viewer, scrolled to the point named in its filename.

| File | What is on screen |
| --- | --- |
| `01-room-opened.txt` | The room before anybody speaks: goal in the status bar, seven seats in the roster, empty stream. |
| `02-priya-checks-the-sources.txt` | The opening turn — a participant who went and read the reporting instead of trusting the brief, and separates RubyGems from Hugging Face. |
| `03-elena-on-the-law-pavel-in-russian.txt` | The bilingual seam: an EU-law answer in English immediately followed by a Russian reply to the same message. One stream, two languages, no translation layer. |
| `04-viktor-challenges-the-framing.txt` | The non-Western read entering the room and disagreeing with the framing rather than adding to it. |
| `05-omar-proposes-the-quarantine.txt` | The engineering proposal the next four rounds are spent dismantling. |
| `06-omar-concedes-the-trigger.txt` | "He's right. I missed the trigger." — a participant checking a claim against the actual upload path and folding. |
| `07-pavel-refuses-the-quarantine.txt` | The refusal from the seat that would have to live with it: a 48-hour queue is fine until the security hotfix is in it. |
| `08-the-vote-round.txt` | Participants backing or dissenting from the drafted assessment, each tagged `vote` and pointed at the draft. |
| `09-omar-retracts-his-own-proposal.txt` | The author of the sandbox proposal deprioritising it, because a firewall rule closes the vectors that actually fired. |
| `10-the-closing-assessment.txt` | The room's output: established / alleged / assessment / recommended / not converged / would change it. |

**Known rendering defect, visible in these frames.** A word ending exactly at the
wrap column loses its last character — `over 2,00 packages` for `2,000`,
`натянули ег` for `его`. The stored message is intact; the loss is in the
terminal library's wrapping. Pinned by `test/client/wrap-defect.test.ts` with
`test.failing`, so it starts failing the day it is fixed upstream, and
deliberately not worked around: the obvious one-column margin was measured and
moved the boundary rather than removing the cause.
