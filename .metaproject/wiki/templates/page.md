# <Title>

Version: 0.1.0
Type: <page-type>
Status: draft

## Summary

One paragraph summary.

## Questions this page must close

<!-- Fix the questions BEFORE writing the body. A filled heading is not an
     answer, and a count of filled headings — or of pages — is never the
     completeness check. Every question carries one of
     covered | partial | unknown | not-applicable AND the basis for that verdict.
     A reason nobody wrote down is `unknown - <why there is no source>`;
     never reconstruct an author's intent from the code. -->

| # | Question | Coverage | Basis |
|---|----------|----------|-------|
| Q1 | Main content. | unknown | Main content. |

## Details

Main content.

## Related Code

- `src/...`

## Related Wiki

- [Other Page](../path/page.md)

## Changelog

- 0.1.0 - Initial version.

---

# Explanation templates (AFC-W02)

Four shapes, from `docs/requirements/keryx-agent-first-core/wiki-specification.md` §4.
Replace the `## Details` section above with the mandatory sections of the shape
that fits, and keep the question table either way.

## Scenario — `scenario`

Check question: How does the operation run, and what is left behind after a failure?
Page types: `user-scenario`

Mandatory sections:

- `## Trigger` — What starts this, and who or what starts it.
- `## Inputs and preconditions` — What must already be true, and what the operation is given.
- `## Result` — The observable outcome when it succeeds.
- `## Sequence` — The ordered steps, each attributable to real code.
- `## Side effects` — What is written, sent or changed outside the caller.
- `## Exceptions and errors` — Every failure mode, and the state left behind by each.
- `## Code and test references` — The files and tests that make the sequence checkable.

## Rule — `rule`

Check question: Which rule applies in exactly this situation?
Page types: `business-rule`

Mandatory sections:

- `## Scope` — The situations the rule governs, and the ones it does not.
- `## The rule` — The rule itself, in one statement a reader can apply.
- `## Applicability` — The conditions under which it binds.
- `## Exceptions` — The sanctioned ways out, and what each one requires.
- `## Authority and acceptance basis` — Who decided this, where it is recorded, and on what basis it was accepted.
- `## Enforcement references` — The code, hook or gate that enforces it, and what a reader sees when it fires.

## Decision — `decision`

Check question: Why was this approach chosen, and when does the decision stop applying?
Page types: `decision`

Mandatory sections:

- `## Problem` — The problem the decision was taken against.
- `## Chosen option` — What was chosen, stated plainly.
- `## Rejected alternatives and known reasons` — What else was considered and the recorded reason each lost.
- `## Consequences` — What this costs and what it buys.
- `## Constraints` — What the decision now forbids or requires.
- `## Supersession` — What would end this decision, and what supersedes it if anything does.

## Change guide — `change-guide`

Check question: Where is it safe to change behaviour, and what has to be checked?
Page types: none — author it by hand

Mandatory sections:

- `## Behaviour before and after` — What changes, observably.
- `## Owner and boundary` — Who owns this and where the boundary runs.
- `## Change points` — The specific places a change lands.
- `## Consumers and tests` — Who depends on it and what proves it still works.
- `## Invariants` — What must remain true through the change.
- `## Rollback and compatibility` — How to undo it, and what stays compatible while it is half-applied.
