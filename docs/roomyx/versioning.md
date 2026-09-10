# How roomyx is versioned

roomyx is `0.x`. That is not a formality — it decides which number moves, and
we have been getting it wrong.

## What the spec actually says

[Semantic Versioning 2.0.0](https://semver.org/) numbers its rules, and the ones
that matter here are narrower than they are usually quoted:

- **Rule 4** — *"Major version zero (0.y.z) is for initial development. Anything
  MAY change at any time."*
- **Rule 6** — *"Patch version Z (x.y.Z | **x > 0**) MUST be incremented if only
  backward compatible bug fixes are introduced."*
- **Rule 7** — *"Minor version Y (x.Y.z | **x > 0**) MUST be incremented if new,
  backward compatible functionality is introduced to the public API."*
- **Rule 8** — *"Major version X (X.y.z | **X > 0**) MUST be incremented if any
  backward incompatible changes are introduced to the public API."*

Read the guards. Rules 6, 7 and 8 all say `x > 0`, so **none of them applies to
us.** The spec says nothing about how a `0.x` project should number anything;
"anything MAY change at any time" is the whole of it. So the rule below is a
convention we are choosing, not a standard we are obeying, and it is worth
saying which.

## The convention we follow, and why this one

**In `0.x`, the minor position is the breaking position and the patch position
carries everything else — bug fixes *and* backward-compatible additions.**

The reason is not taste. It is what `^` already means to every consumer:

> The caret range allows changes that do not modify the left-most non-zero
> digit. For `1.0.0` and above that is patch and minor; for `0.x >= 0.1.0` it is
> **patch only**; for `0.0.x`, nothing.

So a dependant on `^0.6.0` receives `0.6.1`, `0.6.2`, … automatically and never
receives `0.7.0`. npm encodes exactly the promise we want to make, and it only
holds if we put breaking changes in the minor position and nothing else there.

The cost of the alternative — treating minor as "features" the way `1.x` does —
is that minor stops distinguishing anything. A consumer sees `0.7.0` and cannot
tell whether it is a new feature or a removed method, so the only safe response
is to read the changelog for every release. That is precisely the work version
numbers exist to save.

| Change | Position | `^0.6.0` gets it? |
| --- | --- | --- |
| A bug fix | patch — `0.6.1` | yes |
| A new command, flag, tool or exported function | patch — `0.6.1` | yes |
| A new optional field on a returned object | patch — `0.6.1` | yes |
| A removed or renamed export, command, flag or tool parameter | **minor — `0.7.0`** | no |
| A changed default that alters what a caller gets without asking | **minor — `0.7.0`** | no |
| A raised runtime floor (Bun, Node, the MCP SDK) | **minor — `0.7.0`** | no |

Every entry in the second group is something that can break a caller who did
nothing. That is the test — not how large the change is, not how much work it
was.

### The pre-1.0 exemption we do not take

Rule 4 permits us to break anything at any time, including in a patch. We do not
use that permission, because the package is published and installed, and
`^0.6.0` in someone's `package.json` is a promise whether or not the spec obliges
us to keep it. If a break has to ship, it ships in the minor position and the
changelog says what to do instead.

## What 1.0.0 would mean

Not "we are proud of it" — a commitment. It means the MCP tool surface
(`room.get_state`, `room.get_transcript`, `room.get_agent_detail`,
`room.post_owner_command`, `roomyx.rooms.list`, `roomyx.skills.sync`), the CLI's
commands and flags, and the room log's on-disk format stop changing without a
major bump. We are not there: the log format grew a field in the current
release, and the review backlog still holds a protocol change to
`room.get_transcript`.

## Audit of what we actually shipped

Recorded rather than corrected. Retagging a published version is worse than
having numbered it wrong, because the wrong number is at least stable.

| Version | What it contained | Correct under this rule |
| --- | --- | --- |
| `0.1.0` | first publish | — |
| `0.2.0` | the TUI binary, which 0.1.0 shipped unreachable | should have been `0.1.1` |
| `0.2.1` | bug fixes only | **correct** |
| `0.3.0` | `skills sync`, `post_owner_command`, subcommands — all additive | should have been `0.2.2` |
| `0.4.0` | owner commands in the TUI, `--version` — all additive | should have been `0.2.3` |
| `0.5.0` | removed `targetPath` from an MCP tool | **correct** |
| `0.6.0` | removed MCP tool parameters and client methods, changed a default | **correct** |

Four of seven were right. The three that were not share one mistake: a release
that felt significant was given a significant-looking number. Significance is
not the axis — **what a caller has to change is.**

## In practice

- The changelog's `Unreleased` section is where the decision is visible: if it
  has a `Removed — breaking` or `Changed — breaking` heading, the next release
  is a minor. If it does not, it is a patch.
- The release job already refuses a tag that disagrees with `package.json`, and
  asserts that the packed artifact reports the tag's version when run. Neither
  of those checks the *choice* of number, which is why it is written down here.
