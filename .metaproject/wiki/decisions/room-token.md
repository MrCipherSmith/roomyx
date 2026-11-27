# Per-room token

Version: 0.1.0
Type: decision
Status: draft

## Summary

Each room's MCP endpoint requires `Authorization: Bearer <token>`. The token is 128 random bits minted per room and recorded in the room's registry entry. It bounds which local processes can drive a room to those that can read the registry. It is not authentication of a person.

## Questions this page must close

| # | Question | Coverage | Basis |
|---|----------|----------|-------|
| Q1 | Why was a credential added to a local-only endpoint? | covered | Module comment in `src/room-token.ts`: the room carries `room.post_owner_command`, so port access is instruction access to an agent holding tools. |
| Q2 | What exactly does it protect against and not? | covered | Same comment: a neighbouring local process that only knows the port; not a person, no identity, no audit trail. |
| Q3 | Where is it minted, stored, checked? | partial | Mint, header, transport and check are in `src/room-token.ts`; the registry storage side was read only for its file mode (0600) in this PR. |
| Q4 | Why a header and not an SDK auth provider? | covered | `roomTransport` comment. |
| Q5 | Does the management endpoint use it? | covered | No: `roomyx mcp` is unauthenticated and deliberately read-only, pinned by `test/mcp-management/server.test.ts`. |

## Problem

D-06 shipped the room transport with no credential, arguing the threat was bounded by the local machine. D-06a amended that for browsers: rebinding guards stop a web page but not a neighbouring process, which sends no `Origin`. Since then the room gained `room.post_owner_command`, so reaching the endpoint means both reading the whole transcript and instructing an agent. The audit walked that chain with `curl` and no credential.

## Chosen option

One module, `src/room-token.ts`, owns the wire format.

- `mintRoomToken()`: `randomBytes(16)` as 32 hex characters.
- `roomTokenHeaders(token)`: `Authorization: Bearer <token>`.
- `roomTransport(url, token)`: the only function that builds a client transport; it passes the header through `requestInit.headers`, which the pinned SDK merges into the POST, the SSE GET and the DELETE from `terminateSession()`.
- `roomTokenRejection(expected, headers)`: the only function that judges an incoming request; returns `null` to proceed or the sentence to refuse with. Comparison is `timingSafeEqual` after a length check.
- The token lives in the registry entry beside the port. The registry file is written mode 0600 in a 0700 directory (this PR).

## Rejected alternatives and known reasons

- No credential (D-06): rejected once the room could carry owner commands.
- SDK `authProvider`: rejected. It is an OAuth client, a 401 starts a discovery-and-redirect flow with no counterpart here, and its tokens are refreshable, which this one is not.
- Query-string token: rejected. It would land in shell history and access logs.
- A bespoke `X-Roomyx-*` header: rejected in favour of `Authorization: Bearer`, which every client, proxy and log redactor already treats as a credential.
- Header at each call site: rejected. `allowedHosts` (D-06a) was correct in the abstract and silently refused roomyx's own client because that path was never exercised; one builder and one judge means a wire change cannot break one caller and leave another working.

## Consequences

- Four in-tree callers (`RoomClient`, `callRoomTool`, `probeRoomState`, the liveness probe) and every test that connects to a real `serve()` go through `roomTransport`.
- Refusals are two sentences (missing vs mismatched) and never echo the presented value or reveal the expected one.
- A repeated `Authorization` header is treated as absent.
- `roomyx-client --connect <url>` against a room this machine did not register has no token and fails as a 401 from the server, not as a type error.
- Anyone who can read the registry can drive the room, so the registry's file mode is part of the security boundary. Registries written before this PR stay world-readable until the next write.

## Constraints

- Never build a room client transport outside `roomTransport`, and never judge a request outside `roomTokenRejection`.
- Never log or echo a presented token.
- The token must come from `node:crypto`, not `Math.random()`.
- This is local process scoping, not user authentication: do not describe it as login.

## Supersession

Ends if rooms move to real per-user identity (for example OAuth on a remote transport), at which point `authProvider` becomes the right fit and this module's wire format is replaced. Nothing currently supersedes it.

## Related Code

- `src/room-token.ts`
- `src/server/http-transport.ts`
- `src/installer/registry.ts`
- `src/mcp-management/server.ts`
- `test/mcp-management/server.test.ts`

## Related Wiki

- [Writer lease](writer-lease.md)
- [Wiki Index](../index.md)

## Changelog

- 0.1.0 - Initial version, written from `src/room-token.ts` and its module comments.
