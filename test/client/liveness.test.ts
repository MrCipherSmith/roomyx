import { describe, expect, test } from "bun:test";
import { formatAge, livenessLine } from "../../src/client/liveness";

const NOW = 1_757_000_000_000;

describe("the liveness line", () => {
  test("a healthy room with no messages says what it is waiting for", () => {
    // The state a person meets first, and the one they used to read as "it
    // hung" — correctly connected, roster loaded, nothing said yet.
    expect(livenessLine({ status: "connected", messageCount: 0, lastMessageAt: null, now: NOW })).toBe(
      "connected · waiting for the first message",
    );
  });

  test("a live room reports a fact that moves, not a word that never changes", () => {
    expect(livenessLine({ status: "connected", messageCount: 4, lastMessageAt: NOW - 12_000, now: NOW })).toBe(
      "4 messages · last 12s ago",
    );
    expect(livenessLine({ status: "connected", messageCount: 1, lastMessageAt: NOW - 1_000, now: NOW })).toBe(
      "1 message · last 1s ago",
    );
  });

  test("a dropped connection leads, names itself, and carries the age", () => {
    // A room that just dropped and one that has been dead ten minutes must not
    // read the same — that ambiguity is what let a person watch a corpse.
    expect(livenessLine({ status: "disconnected", messageCount: 9, lastMessageAt: NOW - 4_000, now: NOW })).toBe(
      "DISCONNECTED — retrying · last message 4s ago",
    );
    expect(livenessLine({ status: "disconnected", messageCount: 9, lastMessageAt: NOW - 600_000, now: NOW })).toBe(
      "DISCONNECTED — retrying · last message 10m ago",
    );
  });

  test("a disconnect before any message still says so", () => {
    expect(livenessLine({ status: "disconnected", messageCount: 0, lastMessageAt: null, now: NOW })).toBe(
      "DISCONNECTED — retrying",
    );
  });

  test("a clock that has gone backwards does not print a negative age", () => {
    expect(livenessLine({ status: "connected", messageCount: 2, lastMessageAt: NOW + 5_000, now: NOW })).toBe(
      "2 messages · last 0s ago",
    );
  });

  test("ages stay short enough to sit in a footer", () => {
    expect(formatAge(0)).toBe("0s");
    expect(formatAge(59)).toBe("59s");
    expect(formatAge(60)).toBe("1m");
    expect(formatAge(3599)).toBe("59m");
    expect(formatAge(3600)).toBe("1h");
  });
});
