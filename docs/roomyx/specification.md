# roomyx — specification

Version: 0.5.0

## Module Identity

- **Название:** `roomyx` — интерактивный терминальный интерфейс к startup-room комнатам, через MCP.
- **Тип:** два независимых процесса — MCP-сервер (встроен в оркестратор) и TUI-клиент (отдельный терминальный процесс), соединённые по loopback HTTP.
- **Статус:** сервер (`room.get_state`/`room.get_transcript`/`room.get_agent_detail`, R2-R4) — `implemented` (flow 001). Транспорт (`roomyx serve`) и TUI-клиент (chat view, agent modal) — `implemented` (flow 002, 2026-09-09), верифицировано реальными захваченными кадрами терминала через `@opentui/core/testing`. `room.post_owner_command` (R5) — `implemented` (2026-09-09): тул принимает команду и передаёт её обработчику, который предоставляет встраивающий диспетчер; сам сервер по-прежнему не пишет в лог (D-01). Авто-подъём TUI оркестратором как дочернего процесса остаётся `spec ready` — и это сознательно: D-06 держит TUI отдельным процессом, поэтому «поднять» его означает подсказать оператору команду, что и делает бандлед-скилл.

## Structure

```text
roomyx/
  src/
    log/               # implemented (flow 001): store.ts, types.ts
    server/
      index.ts          # implemented: createRoomMcpServer() — три read-only тула
      serve.ts           # NEW (эта версия): биндит сервер к транспорту и слушает
      tools/             # implemented
    client/              # NEW (эта версия): TUI-клиент
      index.ts            # entrypoint: подключается, поднимает рендерер
      mcp-client.ts        # MCP-клиент: connect + polling get_transcript/get_state
      screens/
        chat-view.ts        # основной экран: ростер + поток сообщений
        agent-modal.ts       # модалка одного участника
      components/
        message-row.ts       # одна строка чата (per-row Renderable, не один текстовый блоб)
        roster-sidebar.ts
        status-bar.ts         # goal contract коротко + статус соединения
    cli/
      seed.ts            # implemented: dev-хелпер для ручного тестирования лога
  test/                  # implemented: store/tools тесты; NEW: client polling/render logic tests
```

**Важно:** MCP-сервер не является отдельным долгоживущим сервисом — он существует ровно пока существует комната (тот же процесс/сессия оркестратора). Это отличается от `keryx serve` (loopback HTTP, отдельный долгоживущий демон, живущий поверх всех комнат) — roomyx сервер биндится к loopback HTTP (см. Transport ниже) на время жизни ОДНОЙ конкретной комнаты, не дольше.

## Transport (NEW, эта версия)

**Решение: Streamable HTTP на loopback, без токена в v1.** Обоснование и альтернативы — `decisions.md` D-06.

- Сервер слушает `127.0.0.1:<port>` (порт по умолчанию `4319`, переопределяется `--port`; `--port 0` — эфемерный порт, адрес печатается в stdout при старте, чтобы оркестратор мог передать его в TUI).
- Никогда не биндится не-loopback без явного флага (`--acknowledge-non-loopback`), по прямой аналогии с `keryx serve` — то же обоснование: loopback по умолчанию, осознанное расширение — по флагу, не по умолчанию.
- Аутентификации в v1 нет: угроза модели ограничена локальной машиной оператора (тот же уровень доверия, что у процесса, который её же запустил); если roomyx когда-нибудь станет доступен не-loopback, `keryx serve`-стиль токена (`serve token issue/rotate/revoke`) — обязательное условие для этого расширения, не факультативное.
- И сервер, и клиент используют официальный транспорт из `@modelcontextprotocol/sdk` (`StreamableHTTPServerTransport` / `StreamableHTTPClientTransport`) — не самодельный протокол поверх HTTP.

## Manifest / Config Shape

Комната по-прежнему описывается тем же, что уже специфицировано в `startup-room-framework`: goal contract (см. `../startup-room-framework/specification.md` → Goal contract manifest, R2) и roster. roomyx не вводит второй, параллельный формат конфигурации — сервер читает то же append-only лог-состояние, что диспетчер уже ведёт, и переупаковывает его в MCP-ответы.

## CLI / Skill Surface

- `roomyx serve <logPath> [--port N] [--acknowledge-non-loopback]` — NEW: поднимает MCP-сервер, биндит к loopback HTTP, печатает фактический адрес в stdout. Оркестратор запускает это при старте комнаты (`implemented` статус — `createRoomMcpServer()` — не включает сам transport-биндинг; этот CLI — недостающий слой, задача этой версии спеки).
- `roomyx-client [--room <id>] [--connect http://127.0.0.1:4319]` — запускает TUI, подключается к уже поднятому серверу. Отдельный бинарник, потому что D-06 держит TUI независимым процессом; `roomyx client` (через пробел) — алиас, поднимающий тот же TUI из основного бинарника. Ручной запуск пользователем в отдельном терминале — основной путь v1 (R6); авто-подъём оркестратором как дочернего процесса — второй шаг, не в этой версии.

## TUI Client Architecture (NEW, эта версия)

### Стек

`@opentui/core` (тот же нативный — Zig/Rust-backed — рендерер, что использует сам keryx для своего TUI). roomyx НЕ импортирует внутренние TUI-хелперы keryx (`src/tui/modal-host.ts`, `transcript-blocks.ts` и т.п.) — они не экспортируются как публичная библиотека (D-02 в `decisions.md` уже фиксирует этот принцип для MCP-слоя; распространяем на TUI-слой тем же обоснованием). roomyx строит свой минимальный набор компонентов поверх опубликованных примитивов `@opentui/core` (`createCliRenderer`, `BoxRenderable`, `TextRenderable`, `ScrollBoxRenderable` и т.д.), вдохновляясь наблюдаемым в keryx паттерном (per-row `Renderable` с собственным `onMouseDown`, а не один текстовый блоб на всю область — `mcp-inspector.ts`'s комментарий это явно объясняет), но не связан с деталями его реализации.

### Экраны

1. **Chat view (главный экран).** Разбит по вертикали: `StatusBar` сверху (goal contract коротко: цель одной строкой + текущий статус исходов PASS/FAIL/BORDERLINE, если применимо), `RosterSidebar` слева (список участников из `room.get_state`, каждый — отдельный `Renderable`-ряд, кликабельный/навигируемый стрелками), основной поток сообщений справа (`ScrollBoxRenderable`, автоскролл к низу при поступлении новых сообщений, если пользователь уже был внизу — не дёргает вид, если он проскроллил вверх читать историю).
2. **Agent modal.** Открывается по `Enter`/клику на участнике в ростере. Модальное окно поверх chat view (не замена экрана — chat view остаётся видимым фоном/приглушённым, паттерн из `mcp-inspector.ts`). Показывает: имя, только реплики этого участника (`room.get_agent_detail`), `lastSeenSeq`. Явно НЕ показывает внутреннюю трассировку рассуждений участника — это заявленный v1-предел из `prd.md` (Claude Code сегодня не отдаёт внутренние мысли субагента как структурированный поток).

### Data flow

- Клиент подключается один раз при старте (`StreamableHTTPClientTransport`), затем **поллит**, не подписывается на push: `room.get_state` раз в N секунд (по умолчанию 3с, roster/goal contract меняются редко), `room.get_transcript` чаще (по умолчанию раз в 1с, с локально хранимым `since_seq` — клиент никогда не перезапрашивает уже полученные сообщения). Явный выбор поллинга, не push/SSE-подписки — соответствует уже принятому для самого сервера принципу "перечитываем файл по каждому вызову, живого watch нет" (см. `roomyx/README.md`); не вводим асимметрию, где сервер simple/stateless, а клиент ожидает от него push-семантику, которую тот не даёт.
- Ошибка соединения (сервер ещё не поднят/упал) — TUI показывает явный статус в `StatusBar` ("не удалось подключиться, повтор через Ns"), не падает и не показывает пустой экран без объяснения.

### Keybindings

| Клавиша | Действие |
|---|---|
| `↑`/`↓` | навигация по ростеру |
| `Enter` | открыть модалку выбранного участника |
| `Esc` | закрыть модалку / выйти из выделения |
| `q` / `Ctrl+C` | выход из TUI (не останавливает сервер — независимые процессы) |

Клавиш для команд владельца (veto/constraint) в TUI пока нет. Серверная сторона R5 уже есть — `room.post_owner_command` принимает команду и передаёт её диспетчеру, — но привязать её к клавише имеет смысл только там, где диспетчер действительно подключён; у комнаты, поднятой голым `roomyx serve`, обработчика нет, и тул честно отвечает отказом. До тех пор TUI остаётся read-only просмотрщиком.

## Data Contracts — MCP Tool Surface (proposed, v1)

| Tool | Вход | Выход | Соответствует требованию |
|---|---|---|---|
| `room.get_state` | — | roster, номер текущего раунда, версия goal contract, общий статус | R3 |
| `room.get_transcript` | `since_seq: integer` | список сообщений с `seq > since_seq` (формат — `message-envelope.schema.json` из `startup-room-framework`) | R3 |
| `room.get_agent_detail` | `agent_id: string` | последние реплики и статус конкретного участника (v1: без внутренней трассировки рассуждений — см. риск в `prd.md`) | R4 |
| `room.post_owner_command` | `kind: veto \| constraint \| add_participant \| goal_edit`, `body: string` | подтверждение приёма; диспетчер обрабатывает команду и сам пишет результат в лог (сервер НЕ пишет в лог напрямую — см. `decisions.md` D-01) | R5 |

Все схемы message envelope и goal contract переиспользуются из `../startup-room-framework/schemas/` — roomyx не определяет собственный, второй формат сообщения.

## Integration Points

- **`startup-room-framework`** — источник формата сообщений/goal contract; roomyx — потребитель, не заменяет и не дублирует его протокол.
- **keryx `src/mcp` / `src/tui/mcp-inspector.ts`** — референсная реализация MCP-сервера и TUI-инспектора внутри keryx; roomyx ориентируется на тот же паттерн (не обязательно переиспользует код напрямую в v1 — см. `decisions.md` D-02 про copy vs dependency в этом контексте).
- **keryx `src/mcp-client`** — сегодня заточен только под `codex mcp-server` (D-04 в `keryx-mcp-client`); roomyx v1 НЕ зависит от него, так как каждая сессия однопровайдерная и поднимает собственный сервер, а не подключается к чужому (см. Non-goals в `README.md`).

## Acceptance Criteria

| ID | Критерий | Статус |
|---|---|---|
| AC1 | TUI показывает сообщения комнаты в реальном времени через `room.get_transcript`, без параллельного чтения сырого лог-файла | `implemented` (flow 002, `test/client/render.test.ts` — реальный захваченный кадр терминала содержит ростер и сообщения) |
| AC2 | Открытие модалки агента показывает только его данные (`room.get_agent_detail`), не полный транскрипт | `implemented` (flow 002; независимое ревью нашло и помогло исправить реальный баг — модалка изначально не перекрывала экран из-за отсутствия `position: absolute`) |
| AC3 | `room.post_owner_command` не пишет в лог сама — диспетчер получает команду и пишет решение сам, единственный писатель лога не меняется | `implemented` (`test/server/owner-command.test.ts`: команда доходит до обработчика хоста, а лог после вызова побайтово тот же; без обработчика тул честно отвечает `accepted: false`) |
| AC4 | Смена оркестратора (Claude Code → Codex → keryx shell) не требует изменений в TUI-клиенте — контракт инструментов один и тот же независимо от того, кто сервер поднял | `spec ready` (архитектурно верно по построению; Codex/keryx shell как оркестраторы не тестировались) |
| AC5 | Ни один из тулов не заявлен как поддерживающий смешение провайдеров внутри одной комнаты — это explicit non-goal v1 | `implemented` (верно и для текущего сервера) |
| AC6 | `roomyx serve` биндится только к `127.0.0.1` без `--acknowledge-non-loopback`; попытка забиндиться на не-loopback без флага завершается ошибкой, не предупреждением | `implemented` (flow 002, `test/server/serve.test.ts`) |
| AC7 | `roomyx client` восстанавливает соединение и продолжает с локально сохранённого `since_seq`, если сервер временно недоступен — не запрашивает заново уже полученные сообщения при переподключении | `implemented` (flow 002, `test/client/mcp-client.test.ts`) |
| AC8 | Chat view не перескакивает вниз при поступлении нового сообщения, если пользователь прокрутил историю вверх | `implemented` через встроенный `stickyScroll`/`stickyStart: "bottom"` в `@opentui/core`; конкретно сценарий "прокрутил вверх, потом пришло сообщение" отдельным тестом не покрыт |
| AC9 | Ни сервер, ни клиент не пишут в лог-файл комнаты ни при каких обстоятельствах v1 | `implemented`, тестами покрыто для сервера (flow 001 AC4, flow 002 `serve.test.ts`); клиент физически не имеет кода записи в файл (только HTTP-вызовы) |

**Текущий статус: AC1-AC3, AC5-9 — `implemented`; AC4 — `spec ready` (смена оркестратора верна по построению, но на практике не протестирована).**

## Requirement Coverage Map

| Требование | Раздел спецификации | Статус |
|---|---|---|
| R1 — единый провайдер на сессию | Data Contracts (нет multi-provider полей ни в одном tool) + AC5 | `implemented` (верно по построению для существующего сервера) |
| R2 — MCP-сервер как источник состояния | Structure, CLI / Skill Surface | `implemented` — три read-only тула плюс транспорт `roomyx serve` |
| R3 — общий чат-вид | Data Contracts → `room.get_state`, `room.get_transcript`; TUI Client Architecture → Chat view | `implemented` — и сервер, и UI (`test/client/render.test.ts` — реальный кадр терминала) |
| R4 — модалка на агента | Data Contracts → `room.get_agent_detail`; TUI Client Architecture → Agent modal | `implemented` — и сервер, и UI |
| R5 — интерактивные команды владельца | Data Contracts → `room.post_owner_command` | `partial` — серверная сторона реализована (тул принимает команду и передаёт диспетчеру); в TUI клавиш для отправки команд пока нет, он остаётся read-only просмотрщиком |
| R6 — ручной и автоматический запуск | CLI / Skill Surface → `roomyx client`, `roomyx serve` | `partial` — ручной запуск реализован (`roomyx-client`, `roomyx client`); автоматический доведён до подсказки в бандлед-скилле, спавна дочернего процесса нет (D-06) |
