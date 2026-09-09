# Testing Context

generatedAt: 2026-09-09T16:57:22.204Z
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
- test/client/first-message.test.ts
- test/client/keymap.test.ts
- test/client/liveness.test.ts
- test/client/mcp-client.test.ts
- test/client/message-row.test.ts
- test/client/owner-prompt.test.ts
- test/client/render.test.ts
- test/client/scroll.test.ts
- test/client/search-prompt.test.ts
- test/client/transcript.test.ts
- test/client/wrap-defect.test.ts
- test/installer/init.test.ts
- test/installer/registry.test.ts
- test/installer/resolve-connection.test.ts
- test/installer/skill-sync.test.ts
- test/installer/skill-targets.test.ts
- test/log/store.test.ts
- test/mcp-management/server.test.ts
- test/server/owner-command.test.ts
- test/server/rebinding-guard.test.ts
- test/server/serve.test.ts
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
- docs/roomyx/specification.md: roomyx — specification
- docs/roomyx/specification.md: test/                  # implemented: store/tools тесты; NEW: client polling/render logic tests
- docs/roomyx/specification.md: Текущий статус: AC1-AC3, AC5-9 — `implemented`; AC4 — `spec ready` (смена оркестратора верна по построению, но на практике не протестирована).**
- docs/roomyx/specification.md: Requirement Coverage Map
- docs/roomyx/specification.md: | R3 — общий чат-вид | Data Contracts → `room.get_state`, `room.get_transcript`; TUI Client Architecture → Chat view | `implemented` — и сервер, и UI (`test/client/render.test.ts` — реальный кадр терминала) |
- docs/roomyx/testing-story.md: Testing roomyx end to end, with keryx shell
- docs/roomyx/testing-story.md: What you are testing is that roomyx's CLI is legible to an agent driving it:

## Recommendations

- none
