# Testing Context

generatedAt: 2026-09-09T18:24:04.579Z
status: complete

## Frameworks

- bun

## Scripts

- `check`: `bun run lint && bun run typecheck && bun test`
- `lint`: `eslint src test`
- `test`: `bun test`

## Configs

- tsconfig.json

## Test Files

- test/cli-commands.test.ts
- test/cli-launcher.test.ts
- test/cli-room.test.ts
- test/cli-serve-lifecycle.test.ts
- test/cli/args.test.ts
- test/client-shutdown.test.ts
- test/client/export-name.test.ts
- test/client/first-message.test.ts
- test/client/help-overlay.test.ts
- test/client/keymap.test.ts
- test/client/liveness.test.ts
- test/client/mcp-client.test.ts
- test/client/message-row.test.ts
- test/client/owner-prompt.test.ts
- test/client/render.test.ts
- test/client/renderable-lifetime.test.ts
- test/client/roster-overflow.test.ts
- test/client/scroll.test.ts
- test/client/search-prompt.test.ts
- test/client/shutdown-order.test.ts
- test/client/tool-error.test.ts
- test/client/transcript.test.ts
- test/client/wrap-defect.test.ts
- test/installer/init.test.ts
- test/installer/registry.test.ts
- test/installer/resolve-connection.test.ts
- test/installer/skill-sync.test.ts
- test/installer/skill-targets.test.ts
- test/log/store.test.ts
- test/log/write-contract.test.ts
- test/mcp-management/server.test.ts
- test/server/owner-command.test.ts
- test/server/rebinding-guard.test.ts
- test/server/serve.test.ts
- test/server/session-lifetime.test.ts
- test/server/shutdown.test.ts
- test/server/tools.test.ts


## CI

- .github/workflows/ci.yml
- .github/workflows/release.yml

## Conventions

- AGENTS.md: For commands, search, diff, test logs, lint/build output, and large file reads that can produce long output, use the Metaproject gdctx skill by default before loading raw command output into context.
- AGENTS.md: For creating, changing, debugging, reviewing, or running tests, use the Metaproject testing skill and read .metaproject/data/testing/context.md before broad test search or raw logs.
- CLAUDE.md: For commands, search, diff, test logs, lint/build output, and large file reads that can produce long output, use the Metaproject gdctx skill by default before loading raw command output into context.
- CLAUDE.md: For creating, changing, debugging, reviewing, or running tests, use the Metaproject testing skill and read .metaproject/data/testing/context.md before broad test search or raw logs.
- docs/roomyx-installer/README.md: | [`specification.md`](specification.md) | структура `.roomyx/`, реестр комнат, MCP management-сервер, механизм синхронизации SKILL.md |
- docs/roomyx-installer/specification.md: roomyx-installer — specification
- docs/roomyx-installer/specification.md: | AC1 | `roomyx init` in an empty temp directory creates `.roomyx/config.json` and `.roomyx/rooms/registry.json` with valid default content | `implemented` (`test/installer/init.test.ts`) |
- docs/roomyx-installer/specification.md: Requirement Coverage Map
- docs/roomyx/README.md: | [`specification.md`](specification.md) | архитектура, MCP-контракт инструментов, критерии приёмки |
- docs/roomyx/improvement-backlog.md: > perfectly-specified triviality beats a roughly-specified emergency. We built a
- docs/roomyx/improvement-backlog.md: was unit-tested against fixtures without any room log existing. What it blocks
- docs/roomyx/improvement-backlog.md: Found by rendering `ChatView` under `@opentui/core`'s headless test renderer
- docs/roomyx/improvement-backlog.md: > draws seq 1. The room found this through the headless test renderer, which
- docs/roomyx/improvement-backlog.md: `testing-story.md:171` promises "if you had scrolled up to read history, the
- docs/roomyx/improvement-backlog.md: A test fails when seq 1 is not drawn.** Not "seq 1 is drawn" — a test that
- docs/roomyx/improvement-backlog.md: `test/client/render.test.ts` asserts roster names and the goal statement and
- docs/roomyx/improvement-backlog.md: > A test suite that certifies the frame and not the picture. — Théo
- docs/roomyx/improvement-backlog.md: > the state machine, then the row. And write the failing test before either.
- docs/roomyx/improvement-backlog.md: Two premises were tested rather than assumed, and both failed:
- docs/roomyx/improvement-backlog.md: `Host: roomyx.attacker.test` all completed the handshake, and RSS went
- docs/roomyx/improvement-backlog.md: The release smoke test cannot fail, and would never have caught R8.**
- docs/roomyx/improvement-backlog.md: every release. A smoke test that cannot fail is a green light wired to
- docs/roomyx/improvement-backlog.md: `testing-story.md` step 9 overclaimed the skill-sync safety.** It said roomyx
- docs/roomyx/review-2026-09-09.md: Nine reviewers, path mode over 62 files (`src` and `test`), run through
- docs/roomyx/review-2026-09-09.md: M12 — the regression tests do not hold the fixes they were written for **[reproduced]**
- docs/roomyx/review-2026-09-09.md: `review-testing-practices`, by mutation.*
- docs/roomyx/review-2026-09-09.md: Each fix deleted or inverted one at a time, then its own named test file run:
- docs/roomyx/review-2026-09-09.md: | mutation | its test file |
- docs/roomyx/review-2026-09-09.md: written and stopped being one when the test was rewritten for the new typography
- docs/roomyx/review-2026-09-09.md: M13 — the timing margin in the render tests is under 2x **[reviewer-evidenced]**

## Recommendations

- none
