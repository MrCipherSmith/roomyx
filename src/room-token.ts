import { randomBytes, timingSafeEqual } from "node:crypto";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * The per-room token: one wire format, one place.
 *
 * ## Why this module exists at all
 *
 * D-06 shipped the room transport with no credential, on the argument that the
 * threat was bounded by the local machine. D-06a amended that for browsers and
 * said plainly what the rebinding guards do and do not do: they stop a *page*
 * and they do not stop a *neighbouring process*, because a local program sends
 * no `Origin` and walks straight past the check. What changed since is what is
 * behind the port. The room now carries `room.post_owner_command`, so reach to
 * the endpoint is not only read access to the whole transcript — it is
 * instruction access to an agent that is holding tools. The audit walked that
 * chain with `curl` and no credential of any kind.
 *
 * ## What it is, and what it is not
 *
 * It is **not authentication of a person**, and calling it that would repeat the
 * mistake D-06a was written to avoid. Nobody signs in; there is no identity and
 * no audit trail. What it does is bound *which local processes can drive the
 * room* to the ones that were told the room exists — the ones that can read the
 * registry entry. A process that only knows a port is no longer enough.
 *
 * ## Why one module rather than a header at each call site
 *
 * Four in-tree callers reach a room — `RoomClient`, `callRoomTool`,
 * `probeRoomState` and the liveness probe on top of it — plus every test that
 * connects to a real `serve()`. D-06a records the failure mode of spreading that
 * out: `allowedHosts` was set correctly in the abstract and silently refused
 * roomyx's own client, because the client's own path was never exercised. The
 * symptom there was not a red test; it was a room answering "did not answer".
 * So there is exactly one function that builds a client transport
 * (`roomTransport`) and exactly one that judges an incoming request
 * (`roomTokenRejection`). A change to the wire format that breaks one caller
 * cannot leave another one working.
 */

/**
 * 32 hex characters — 128 bits out of `node:crypto`.
 *
 * `randomBytes`, not `Math.random()`: the registry is world-readable on a
 * typical umask, so the token's job is not to be unguessable *to the operator's
 * own user* — it is to be unguessable to anything that has only the port. A
 * predictable value would hand that back.
 */
export function mintRoomToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * The header a caller presents. A plain `Authorization: Bearer <token>` rather
 * than a bespoke `X-Roomyx-*` name or a query parameter: it is what every HTTP
 * client, proxy and log redactor already knows to treat as a credential, and a
 * query parameter would end up in shell history and access logs.
 */
export function roomTokenHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * A client transport that presents the room's token — the one helper every
 * caller goes through.
 *
 * `requestInit.headers` rather than the SDK's `authProvider`, and this is worth
 * stating because `authProvider` looks like the obvious fit. It is an OAuth
 * client: a 401 makes it start a discovery-and-redirect flow that has no
 * counterpart here, and its tokens are refreshable, which this one is not.
 * Measured against the pinned SDK: `requestInit.headers` is merged into
 * `_commonHeaders()`, which is used by all three request paths the transport
 * makes — the POST, the GET that opens the SSE stream, and the DELETE that
 * `terminateSession()` sends. That last one matters: a DELETE refused with 401
 * would leak a server-side session on every close, which is the leak the session
 * bookkeeping in `http-transport` exists to prevent.
 *
 * `token` is allowed to be `undefined` so that the one path which genuinely has
 * no token — `roomyx-client --connect <url>` against a room this machine did not
 * register — fails as a 401 from the server rather than as a type error miles
 * away. Every other caller has a token and must pass it.
 */
export function roomTransport(url: string | URL, token: string | undefined): StreamableHTTPClientTransport {
  const target = typeof url === "string" ? new URL(url) : url;
  if (token === undefined) return new StreamableHTTPClientTransport(target);
  return new StreamableHTTPClientTransport(target, { requestInit: { headers: roomTokenHeaders(token) } });
}

/** The server side of `roomTokenHeaders`: the token a request presented, if any. */
export function parseBearerToken(authorization: string | string[] | undefined): string | undefined {
  // node:http gives `string | string[] | undefined`. A repeated Authorization
  // header is not something any legitimate client sends, and picking one of them
  // would be a guess, so it is treated as absent.
  if (typeof authorization !== "string") return undefined;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(authorization.trim());
  return match?.[1];
}

/**
 * What a refused request is told. Two sentences, because "you sent nothing" and
 * "you sent the wrong thing" are different things to debug — and neither one
 * reveals anything about the expected value, which is the property that matters.
 * The presented value is not echoed either: it would land in whatever log the
 * caller keeps, and a credential in a log is a credential leaked.
 */
const MISSING =
  "Unauthorized: this room requires its per-room token, presented as `Authorization: Bearer <token>`. " +
  "The token is recorded in the room's registry entry, beside the port.";
const MISMATCHED = "Unauthorized: the token presented is not this room's token.";

/**
 * `null` to proceed, or the sentence to refuse with. The comparison is
 * `timingSafeEqual`, not `===`.
 *
 * A length check before it is not a leak worth worrying about: `mintRoomToken`
 * makes one length and only one, so the length is public. What it prevents is
 * `timingSafeEqual` throwing on unequal buffers, which would surface as a 500
 * and hand a caller a way to tell a wrong-length guess from a wrong-value one by
 * status code.
 */
export function roomTokenRejection(expected: string, headers: { authorization?: string | string[] }): string | null {
  const presented = parseBearerToken(headers.authorization);
  if (presented === undefined) return MISSING;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return MISMATCHED;
  return timingSafeEqual(a, b) ? null : MISMATCHED;
}
