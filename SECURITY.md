# Security

## Reporting a vulnerability

Please report security issues privately, not as a public issue.

- **GitHub private advisory** (preferred):
  [open a draft advisory](https://github.com/MrCipherSmith/roomyx/security/advisories/new)
- If that is not available to you, open a public issue containing only the words
  "security report, requesting a private channel" and no details, and you will
  be given one.

Include what you need to make the problem reproducible: the roomyx version
(`roomyx --version`), the operating system, and the shortest sequence that shows
it. A proof of concept is welcome but not required — a clear description of the
path is enough.

This is a small project maintained by one person. You should expect a first
reply within a week. There is no bounty.

## Why this file exists

roomyx writes into directories that other tools trust, and runs a local
network service. That is a larger footprint than "a CLI that prints things",
and it is worth stating plainly so a reader can judge the risk themselves.

**It writes into agent configuration directories.** `roomyx init` and
`roomyx setup` install skill files under `~/.claude/`, `~/.codex/`, `~/.cursor/`
and `~/.grok/`, and register an MCP server entry in the corresponding
configuration file. Everything it would write is shown and confirmed first —
`init` is an explicit command with tick boxes, never an `npm postinstall` hook
(decision D-01 of the installer), and a file that already exists is reported
rather than overwritten (decision D-02).

**It binds a local port.** `roomyx serve` and `roomyx mcp` listen on
`127.0.0.1` unless a non-loopback bind is passed explicitly. Both have DNS
rebinding and Origin checks enabled (decision D-06a), which stop a web page the
operator has open from driving the server.

**The room endpoint requires a per-room token** (decision D-06b). It is minted
at `serve()`, stored in the room's registry entry, and sent as an
`Authorization: Bearer` header. **This is not authentication of a person.** The
registry file is written with default permissions, so the token bounds which
local processes can drive a room to those that were told the room exists — it
does not stop a process running as the same user that can read the registry.

**The management endpoint (`roomyx mcp`) is deliberately unauthenticated.** It
has no owner-command queue, both of its tools report rather than act, and it is
the surface that Claude Code, Codex and keryx are documented to attach to,
where a credential has nowhere to come from.

**Room logs are not gitignored by default.** A room transcript is whatever the
participating agents wrote into it. If that includes credentials or customer
data, it will be committed along with everything else unless you exclude it
yourself.

## Threat model, stated honestly

roomyx assumes the machine it runs on is trusted, and that the agents attached
to a room are trusted to the extent their operator trusts them. It is **not**
designed to be a boundary between mutually distrusting local users, and it does
not defend against a compromised operator account.

What it does try to hold:

- no code executes as a side effect of installing the package — there is no
  `postinstall` hook;
- nothing is written into your home directory without an explicit command and a
  confirmation;
- a file roomyx did not write is not silently overwritten, and a symlink is
  refused rather than followed;
- a room's transcript and its owner-command queue are not reachable from a
  process that was not told the room exists;
- a web page cannot reach a local room server.

If you find a way through any of those, that is a bug worth reporting.

## Supported versions

The latest published version only. roomyx is `0.x` and moves quickly; fixes go
into a new release rather than being backported. In `0.x` the minor position
carries breaking changes and the patch position carries everything else
(decision D-13).
