# Persona Groups

A registry of named groups for quickly launching a startup-room without re-explaining the lineup each time. Each group is a lineup + a focus, so you can reference the group by name.

---

## Group "CIS-Asia"

**Focus:** IT startups for CIS and Asian markets — cross-border trade, regulatory environment, local infrastructure. Originally a broad mandate, narrowed over the course of the session through explicit operator constraints (first finance/banking/sanctions were excluded, then document workflow/compliance in any form).

**Lineup:**
1. Dmitry Volkov — serial entrepreneur, Russia/CIS, cross-border trade and payments (`founders/09-dmitry-cis-trade-founder.md`)
2. Pavel Grishin — senior developer, Russian IT infrastructure (`founders/13-pavel-russia-developer.md`)
3. Aigerim Satpayeva — fintech founder for Central Asia (`founders/10-aigerim-centralasia-founder.md`)
4. Viktor Sokolov — expert on Russian regulatory environment, import substitution (`founders/12-viktor-russia-market-expert.md`)
5. Rohan Malhotra — serial B2B SaaS founder from India (`founders/15-rohan-india-saas-founder.md`)
6. Wei Zhang — veteran of the Chinese tech industry, Southeast Asia expansion (`founders/16-wei-china-tech-veteran.md`)
7. Grace Liu — CFO/unit economics (added later, `panel/04-grace-cfo-financier.md`)
8. Sam Okafor — enterprise developer (added later, `panel/05-sam-enterprise-developer.md`)
9. David Kim — VC partner (added later, `panel/03-david-vc-financier.md`)

**Known lineup limitation:** 4 of the 6 original participants (Viktor, Aigerim, Dmitry, Pavel) have a regulatory/compliance-heavy background — this systematically pulls the discussion toward "document workflow/registries/compliance" even after the topic is explicitly banned. When re-running for a genuinely different angle — keep these four in "comment only" mode, don't let them propose first, and explicitly ask Rohan/Wei/new participants to take the initiative.

**Protocol:** a transcript from an earlier run of this group (`startup-room-cis-asia-it`), kept in the project this library came from and not shipped here

---

## Group "AI Trends"

**Focus:** startup ideas at the intersection of current AI/ML/SaaS trends — vertical AI, AI infrastructure (LLMOps/agent orchestration), consumer AI products, the venture funding landscape for AI. Not tied to a specific region — a global technology focus.

**Lineup:**
1. Lena Kim — founder of a vertical AI-SaaS company, thesis "vertical AI eating horizontal SaaS" (`founders/17-lena-verticalai-saas.md`) — **new persona**
2. Marcus Weber — founder of an AI infrastructure/LLMOps company, production engineering for agents (`founders/18-marcus-ai-infra-llmops.md`) — **new persona**
3. Sophie Lang — founder of a consumer AI product, retention/viral loops (`founders/19-sofia-consumer-ai-product.md`) — **new persona**
4. Aisha Rahman — first startup, ex-FAANG engineer, reliability of AI agents in production (`founders/02-aisha-firsttime-technical-london.md`) — reused
5. Mira Kovac — ML/NLP engineer, specializing in small fine-tuned models (`panel/06-mira-ml-developer.md`) — reused
6. Vanessa Cruz — venture-backed, thesis of aggressive growth through AI agents (`founders/04-vanessa-blitzscaler-sf.md`) — reused
7. David Kim — VC partner, scans funding rounds for AI startups (`panel/03-david-vc-financier.md`) — reused

**Protocol:** a transcript from an earlier run of this group (`startup-room-ai-trends`), kept in the project this library came from and not shipped here (paused — see goal contract v2 in the file header).

---

## Group "Techies"

**Focus:** technical breakdown of fundamentally new product ideas — new paradigms for user interaction with an application (mobile, web, browser), potentially fundamental bets (a new browser, a model-oriented programming language). Not tied to a business model/GTM — the focus is on technical feasibility and novelty of interaction, not on market/sales.

**Lineup:**
1. Yuki Tanaka — AI/ML engineer, agentic systems and human-LLM interaction (`tech/01-yuki-ai-ml-engineer.md`)
2. Omar Haddad — database/backend architect, data scalability (`tech/02-omar-database-backend-architect.md`)
3. Zara Ahmed — UI/UX designer, new interaction paradigms (`tech/03-zara-ui-ux-designer.md`)
4. Finn O'Connell — web platform/browser engineer (`tech/04-finn-web-platform-browser-engineer.md`)
5. Naledi Dlamini — mobile engineer, native interaction patterns (`tech/05-naledi-mobile-engineer.md`)
6. Theo Lefebvre — programming languages/devtools engineer (`tech/06-theo-plt-devtools-engineer.md`)

**Lineup expanded 2026-09-08 for the keryx product review (+4):**
7. Priya Natarajan — security researcher, sandboxes/policy engines for AI agents (`tech/07-priya-security-researcher.md`)
8. Marcus Kim — DX/OSS adoption specialist (`tech/08-marcus-dx-oss-adoption.md`)
9. Elena Kovaleva — engineering manager, a real-world devtools buyer (`tech/09-elena-engineering-manager-buyer.md`)
10. David Mbeki — competitive market analyst for AI devtools (`tech/10-david-competitive-analyst.md`)

**Protocol:** a transcript from an earlier run of this group (`tech-room-new-ux`), kept in the project this library came from and not shipped here — first a search for a new idea, then a product review, both from 2026-09-08.

---

## How to use

When launching `startup-room`, you can reference a group by name instead of listing the lineup again — the moderator takes the list from this file, spawns the participants (reused ones as fresh instances with no old context, unless stated otherwise), and sets the focus as the room's frame.
