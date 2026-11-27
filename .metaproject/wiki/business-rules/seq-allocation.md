# Seq allocation

Version: 0.1.0
Type: business-rule
Status: draft

## Summary

Every message in a room log gets a `seq` allocated from the log itself at append time, under the log's lockfile, as one more than the highest valid `seq` already recorded. Batches are allocated and validated as a set before any byte is written.

## Questions this page must close

| # | Question | Coverage | Basis |
|---|----------|----------|-------|
| Q1 | Where does the next `seq` come from? | covered | `nextSeq` in `src/log/write.ts`. |
| Q2 | What makes two concurrent writers not collide? | covered | `withLock` in `src/lockfile.ts` wraps `appendMessages`. |
| Q3 | What happens to a damaged or out-of-range line? | covered | `recordedSeqForAllocation`. |
| Q4 | Is a multi-message append atomic? | covered | `appendMessages` comment: atomic for every failure it can see before writing; not for an I/O failure mid-loop. |
| Q5 | Who accepted this rule? | partial | Origin is the lost-update bug in the `withLock` comment and D-01a; the decision text itself was not re-read for this page. |

## Scope

Governs any append to a room log through `appendMessage` / `appendMessages` (CLI `room append` and the server's own writes). Does not govern reading: the read schema stays permissive on purpose (see `src/log/schema.ts`).

## The rule

`seq` is never tracked separately and never supplied by the caller. It is `max(valid recorded seq) + 1` (1 for a log with no messages), computed while holding `<log>.lock`.

## Applicability

Always, for a log that exists. `appendMessages` refuses a missing file and points at `roomyx room new`. `createRoomLog` refuses to overwrite an existing log.

Per line, during allocation (header line skipped):

- Not valid JSON: throws a located error naming file and line.
- No numeric `seq`: throws a located error, so a damaged log is blamed on itself and not on the next message.
- A `seq` that is not a safe integer, is below 1, or is at or above `MAX_SEQ`: ignored for allocation (it is a legal recorded value, just not one to build on), so allocation continues from the rest of the log.

## Exceptions

None for the allocation formula. The only sanctioned deviation is the batch form: `appendMessages` takes `base = nextSeq(path)` once and gives the batch `base .. base+n-1`, consecutive, inside one lock.

## Authority and acceptance basis

Recorded in code comments rather than a standalone decision. Before the lock, three concurrent `roomyx room append` calls all allocated `seq: 1` and all landed on disk. `seq` is the transcript cursor, so a client polling between two colliding writes advances past both and never receives the second message, which is on disk and invisible forever. Atomic multi-message appends were added because half a batch silently drops a turn from the middle of a conversation.

## Enforcement references

- `src/log/write.ts`: `nextSeq`, `appendMessages`, `validate` (all envelopes validated with `writeMessageLineSchema` before the first write).
- `src/lockfile.ts`: `withLock` (exclusive `wx` create, owner token, stale reclaim after 30s, release only when the token still matches).
- `src/log/schema.ts`: `MAX_SEQ`.
- Tests: `test/log/write-contract.test.ts`, `test/log/seq-ceiling.test.ts`, `test/lockfile.test.ts`.
- A refused message surfaces as `LogWriteError` and the CLI reports it as a refusal, not a crash.

## Known limit

The append loop is not crash-atomic: a full disk or a signal between `appendFileSync` calls leaves the earlier lines written. A temp-file-and-rename would fix that but contradicts the append-only, appended-in-place contract (a rename replaces the file a live reader has open).

## Related Code

- `src/log/write.ts`
- `src/lockfile.ts`
- `src/log/schema.ts`
- `test/log/write-contract.test.ts`
- `test/log/seq-ceiling.test.ts`
- `test/lockfile.test.ts`

## Related Wiki

- [Writer lease](../decisions/writer-lease.md)
- [Wiki Index](../index.md)

## Changelog

- 0.1.0 - Initial version, written from `src/log/write.ts` and `src/lockfile.ts`.
