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
<!-- generated: never | pages: 0 -->

_No pages yet. Run `keryx wiki index` after creating pages._
<!-- keryx:wiki-index:end -->
