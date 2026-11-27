# Project Wiki

Version: 0.1.0

## Purpose

This is the local project knowledge base. It stores knowledge that should
outlive a single task: architecture, domain models, business rules, user
scenarios, components, services, integrations, and known decisions.

Read this index first. Do not read every page unless necessary.

## How complete is this wiki

The page count below is a count of files. It is not a completeness measure —
nothing here knows which questions the wiki cannot answer. Read the per-type
counts from `keryx wiki status` instead: a type at `0` means no page of that
kind exists, and each authored page carries its own
`## Questions this page must close` table saying which questions it actually
closed.

## Page Types

- `architecture` - system or module architecture
- `domain-model` - entities, invariants, relationships
- `business-rule` - business constraints and decisions
- `user-scenario` - user workflows and expected outcomes
- `component` - UI/component behavior and ownership
- `service` - backend/service responsibility and APIs
- `integration` - external systems and contracts
- `decision` - known decisions and ADR-like records

## Create A Page

```bash
keryx wiki new <type> <slug> --title "<title>"
keryx wiki collect
keryx wiki index
```

## Pages

<!-- keryx:wiki-index:begin -->
<!-- generated: 2026-11-27T23:27:05.496Z | pages: 20 -->

### Architecture

- [Project Map](architecture/project-map.md) (accepted) - Deterministic map of 112 code files, 0 assets, and 210 import edges across 20 top-level modules. See component module pages for enriched documentation.
- [Testing Map](architecture/testing-map.md) (accepted) - generatedAt: 2026-09-09T18:24:04.579Z

### Domain Model

_No pages yet._

### Business Rule

- [Seq allocation](business-rules/seq-allocation.md) (draft) - Every message in a room log gets a `seq` allocated from the log itself at append time, under the log's lockfile, as one more than the highest valid `seq` already recorded. Batches are allocated and validated as a set before any byte is written.

### User Scenario

_No pages yet._

### Component

- [scripts](components/scripts.md) (accepted)
- [src](components/src.md) (accepted)
- [src/cli](components/src-cli.md) (accepted)
- [src/client](components/src-client.md) (accepted)
  - [src/client/components](components/src-client-components.md) (accepted)
  - [src/client/screens](components/src-client-screens.md) (accepted)
- [src/installer](components/src-installer.md) (accepted)
- [src/log](components/src-log.md) (accepted)
- [src/server](components/src-server.md) (accepted)
  - [src/server/tools](components/src-server-tools.md) (accepted)
- [test](components/test.md) (accepted)
- [test/client](components/test-client.md) (accepted)
- [test/installer](components/test-installer.md) (accepted)
- [test/log](components/test-log.md) (accepted)
- [test/server](components/test-server.md) (accepted)

### Service

_No pages yet._

### Integration

_No pages yet._

### Decision

- [Per-room token](decisions/room-token.md) (draft) - Each room's MCP endpoint requires `Authorization: Bearer <token>`. The token is 128 random bits minted per room and recorded in the room's registry entry. It bounds which local processes can drive a room to those that can read the registry. It is not authentication of a person.
- [Writer lease](decisions/writer-lease.md) (draft) - A room log has exactly one writer while a room is live. The writer lease is the on-disk fact that says who that is: held by a server with a dispatcher attached, refreshed by heartbeat, and expiring by itself if the holder dies. One-shot CLI writers never hold one; they leave a tombstone.
<!-- keryx:wiki-index:end -->
