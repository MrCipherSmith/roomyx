# room-tui — specification

Version: 0.1.0

## Module Identity

- **Название:** `room-tui` — интерактивный терминальный интерфейс к startup-room комнатам, через MCP.
- **Тип:** два независимых процесса — MCP-сервер (встроен в оркестратор) и TUI-клиент (отдельный терминальный процесс).
- **Статус:** `draft` — ничего не реализовано, это архитектурная спецификация по итогам обсуждения с оператором.

## Structure

```text
room-tui/
  server/            # MCP-сервер: экспонирует состояние комнаты
                      # (встраивается в оркестратор — Claude Code сессию,
                      # Codex, или keryx shell; НЕ отдельный демон)
  client/             # TUI-клиент: MCP-клиент + рендер чата/модалок
                      # (планируется на базе @opentui/core, тот же стек,
                      # что уже использует keryx для своего TUI)
```

**Важно:** сервер не является отдельным долгоживущим сервисом — он существует ровно пока существует комната (тот же процесс/сессия оркестратора). Это отличается от `keryx serve` (loopback HTTP, отдельный долгоживущий демон) — room-tui сервер имеет время жизни, равное времени жизни конкретной комнаты.

## Manifest / Config Shape

Комната по-прежнему описывается тем же, что уже специфицировано в `startup-room-framework`: goal contract (см. `../startup-room-framework/specification.md` → Goal contract manifest, R2) и roster. room-tui не вводит второй, параллельный формат конфигурации — сервер читает то же append-only лог-состояние, что диспетчер уже ведёт, и переупаковывает его в MCP-ответы.

## CLI / Skill Surface (v1, MVP)

- Оркестратор (сегодня — Claude Code сессия, ведущая комнату) поднимает MCP-сервер при старте комнаты — конкретный механизм подъёма (in-process, дочерний процесс) уточняется на этапе реализации, не фиксируется здесь.
- `room-tui client [--connect <address>]` — запускает TUI, подключается к серверу текущей комнаты. Ручной запуск пользователем в отдельном терминале — основной путь v1 (R6 из `prd.md`); авто-подъём оркестратором — второй шаг.

## Data Contracts — MCP Tool Surface (proposed, v1)

| Tool | Вход | Выход | Соответствует требованию |
|---|---|---|---|
| `room.get_state` | — | roster, номер текущего раунда, версия goal contract, общий статус | R3 |
| `room.get_transcript` | `since_seq: integer` | список сообщений с `seq > since_seq` (формат — `message-envelope.schema.json` из `startup-room-framework`) | R3 |
| `room.get_agent_detail` | `agent_id: string` | последние реплики и статус конкретного участника (v1: без внутренней трассировки рассуждений — см. риск в `prd.md`) | R4 |
| `room.post_owner_command` | `kind: veto \| constraint \| add_participant \| goal_edit`, `body: string` | подтверждение приёма; диспетчер обрабатывает команду и сам пишет результат в лог (сервер НЕ пишет в лог напрямую — см. `decisions.md` D-01) | R5 |

Все схемы message envelope и goal contract переиспользуются из `../startup-room-framework/schemas/` — room-tui не определяет собственный, второй формат сообщения.

## Integration Points

- **`startup-room-framework`** — источник формата сообщений/goal contract; room-tui — потребитель, не заменяет и не дублирует его протокол.
- **keryx `src/mcp` / `src/tui/mcp-inspector.ts`** — референсная реализация MCP-сервера и TUI-инспектора внутри keryx; room-tui ориентируется на тот же паттерн (не обязательно переиспользует код напрямую в v1 — см. `decisions.md` D-02 про copy vs dependency в этом контексте).
- **keryx `src/mcp-client`** — сегодня заточен только под `codex mcp-server` (D-04 в `keryx-mcp-client`); room-tui v1 НЕ зависит от него, так как каждая сессия однопровайдерная и поднимает собственный сервер, а не подключается к чужому (см. Non-goals в `README.md`).

## Acceptance Criteria

| ID | Критерий |
|---|---|
| AC1 | TUI показывает сообщения комнаты в реальном времени через `room.get_transcript`, без параллельного чтения сырого лог-файла |
| AC2 | Открытие модалки агента показывает только его данные (`room.get_agent_detail`), не полный транскрипт |
| AC3 | `room.post_owner_command` не пишет в лог сама — диспетчер получает команду и пишет решение сам, единственный писатель лога не меняется |
| AC4 | Смена оркестратора (Claude Code → Codex → keryx shell) не требует изменений в TUI-клиенте — контракт инструментов один и тот же независимо от того, кто сервер поднял |
| AC5 | Ни один из тулов не заявлен как поддерживающий смешение провайдеров внутри одной комнаты — это explicit non-goal v1 |

**Текущий статус: все AC — `spec ready`, ноль `implemented`.**

## Requirement Coverage Map

| Требование | Раздел спецификации | Статус |
|---|---|---|
| R1 — единый провайдер на сессию | Data Contracts (нет multi-provider полей ни в одном tool) + AC5 | `spec ready` |
| R2 — MCP-сервер как источник состояния | Structure, CLI / Skill Surface | `spec ready` |
| R3 — общий чат-вид | Data Contracts → `room.get_state`, `room.get_transcript` | `spec ready` |
| R4 — модалка на агента | Data Contracts → `room.get_agent_detail` | `spec ready` |
| R5 — интерактивные команды владельца | Data Contracts → `room.post_owner_command` | `spec ready` |
| R6 — ручной и автоматический запуск | CLI / Skill Surface → `room-tui client` | `spec ready` |
