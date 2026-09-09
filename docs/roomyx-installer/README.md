# roomyx-installer

Version: 0.1.0

## Purpose

Packages `roomyx` (the MCP server + TUI client from `docs/requirements/roomyx/`) as an installable npm package with a project-local `.roomyx/` directory, a room registry so the TUI can attach with one command instead of copy-pasting a URL, and an MCP-based mechanism to sync the bundled `startup-room` skill (with room auto-launch built in) into `.claude`/`.codex`/`.keryx`.

## Status

`draft` — architecture decided in conversation with the operator (2026-09-09); nothing implemented yet.

## Document Index

| Документ | Назначение |
|---|---|
| [`README.md`](README.md) | этот файл |
| [`prd.md`](prd.md) | проблема, цели, требования, риски |
| [`specification.md`](specification.md) | структура `.roomyx/`, реестр комнат, MCP management-сервер, механизм синхронизации SKILL.md |
| [`decisions.md`](decisions.md) | принятые решения и явные отказы |

## Scope (v1)

- `@mrciphersmith/roomyx` как единый npm-пакет с CLI (`roomyx init`, `roomyx serve`, `roomyx client`, `roomyx skills sync`, `roomyx rooms list`).
- `.roomyx/` — project-local директория, создаётся явной командой `roomyx init` (не npm postinstall-хуком — та же осторожная конвенция, что уже использует keryx: install, потом явный init).
- Реестр комнат (`rooms/registry.json`) — `roomyx serve` регистрирует себя при старте с ID; `roomyx client` без аргументов ищет единственную живую комнату и цепляется к ней сам.
- MCP management-сервер (отдельный от per-комнатного MCP из `roomyx`) — тулы для синхронизации скиллов в `.claude`/`.codex`/`.keryx`, подключается как обычный MCP-сервер к любому из трёх.
- Пакет несёт с собой обновлённую версию `startup-room` SKILL.md со встроенным авто-подъёмом комнаты — устанавливается через явную команду синхронизации, с бэкапом текущего файла перед перезаписью.

## Non-goals / explicit checkpoints (v1)

- **Публикация в npm** — пакет собирается и готовится к публикации (`private: true` до этого момента), но реальный `npm publish` — отдельное, осознанное действие, не входит в объём этой спеки автоматически. Делается по отдельному явному подтверждению оператора в момент запуска команды.
- **Перезапись реального `~/.claude/skills/startup-room/SKILL.md`** — механизм синхронизации реализуется и тестируется на копиях/фикстурах в этой спеке; фактический запуск синхронизации против настоящего, живого файла — отдельный, явно подтверждаемый шаг (см. `decisions.md` D-02), не автоматический побочный эффект реализации.

## Related Modules

- [`roomyx`](../roomyx/README.md) — сам MCP-сервер и TUI-клиент, которые этот пакет упаковывает и распространяет.
- `~/.claude/skills/startup-room/SKILL.md` — глобальный, живой файл, целевой объект синхронизации; не редактируется этой спекой напрямую, только бандлится обновлённая копия внутри пакета.
