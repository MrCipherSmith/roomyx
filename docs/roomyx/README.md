# roomyx

Version: 0.7.2

## Purpose

Даёт startup-room комнатам живой, интерактивный терминальный интерфейс: общий чат-вид всей комнаты + модалка на каждого отдельного агента (что он сейчас делает) + возможность подавать команды в комнату прямо из TUI (owner-injection channel), вместо единственного текущего интерфейса — Telegram-переписки с диспетчером.

## Status

**`implemented`**: MCP server read-side (R2-R4 tools, flow 001) AND the loopback HTTP transport + full TUI client (flow `002-2026-09-09-roomyx-transport-tui-client-chat-view-`, 2026-09-09) — `bun src/cli.ts serve <logPath>` binds and prints the address; `bun src/client/index.ts --connect <url>` renders a real chat view (roster + scrolling transcript + status bar) and a per-agent modal, verified with real captured terminal frames via `@opentui/core`'s own headless test renderer (`test/client/render.test.ts`), not just "doesn't crash." 30/30 tests pass, independently reviewed (found and fixed 4 real issues, including a modal that silently never rendered as an overlay — see flow 002's journal for the full account), all completion gates green. `room.post_owner_command` (R5), auto-launch of the TUI as an orchestrator child process, and live dispatcher integration (SKILL.md writing to a real log during an actual room) remain `spec ready`, explicitly out of scope for both flows so far.

## Document Index

| Документ | Назначение |
|---|---|
| [`README.md`](README.md) | этот файл |
| [`prd.md`](prd.md) | проблема, цели, пользователи, требования, критерии успеха, риски |
| [`specification.md`](specification.md) | архитектура, MCP-контракт инструментов, критерии приёмки |
| [`decisions.md`](decisions.md) | принятые решения и явные отказы, по конвенции keryx |

## Scope (v1)

- Один провайдер/модель на сессию — тот же, что и запущенный оркестратор (Claude Code / Codex / `keryx shell`). Никакого смешивания провайдеров внутри одной комнаты.
- Оркестратор (тот, кто ведёт комнату сейчас — сам Claude Code инстанс, как в этой сессии) поднимает MCP-сервер, отдающий состояние комнаты.
- TUI — отдельный процесс, MCP-клиент этого сервера: общий чат, модалка по каждому агенту, интерактивные команды владельца (veto/constraint/добавить участника — то, что раньше шло только текстом в Telegram).
- Запуск TUI — вручную пользователем в терминале, либо сам оркестратор поднимает его как дочерний процесс.

## Non-goals (v1, отложено, не забыто)

- Смешивание провайдеров внутри одной комнаты (Claude-персонаж + DeepSeek-персонаж одновременно) — обсуждалось и осознанно отложено оператором в этой же переписке.
- Обобщение MCP-клиента keryx на "любой оркестратор" — сейчас MCP-клиент keryx (`src/mcp-client`) заточен только под `codex mcp-server` (решение D-04 в `keryx-mcp-client` пакете самого keryx); для roomyx v1 это не требуется, так как каждая сессия однопровайдерная и её собственный оркестратор сам поднимает MCP-сервер, а не подключается к чужому.
- Claude как внешний управляемый (write-capable) агент под MCP-контролем другого оркестратора — заблокировано на стороне Anthropic (см. `decisions.md` D-05), не относится к этому пакету, так как Claude-персонажи всегда идут через нативный Agent/SendMessage того же Claude Code, что ведёт комнату.

## Related Modules

- [`startup-room-framework`](../startup-room-framework/README.md) — сам движок startup-room (SKILL.md), который этот TUI визуализирует; roomyx не меняет turn loop/goal contract, только читает и дополняет его MCP-интерфейсом.
- Внешние (в репозитории `keryx`, не `arena`): `docs/requirements/keryx-mcp-client` — прототип и прецедент MCP-клиента в keryx; `docs/requirements/keryx-external-agent-runtime` — контекст решений D-01/D-02 про push-модель и вендорские ограничения.
