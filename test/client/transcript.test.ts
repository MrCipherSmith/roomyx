import { beforeEach, describe, expect, test } from "bun:test";
import { Transcript } from "../../src/client/transcript";
import type { MessageEnvelope } from "../../src/log/types";

function message(seq: number, from: string, fromName: string, body: string, kind?: MessageEnvelope["kind"]) {
  return { kind: "message" as const, fromName, message: { seq, from, body, kind } };
}

let transcript: Transcript;

beforeEach(() => {
  transcript = new Transcript();
  transcript.append(message(1, "a", "Ann", "opening the argument", "pitch"));
  transcript.append(message(2, "b", "Bob", "I disagree with the opening", "challenge"));
  transcript.append({ kind: "system", text: "disconnected, retrying" });
  transcript.append(message(3, "a", "Ann", "holding my position"));
  transcript.append(message(4, "a", "Ann", "and here is why"));
});

describe("filtering the transcript to one participant", () => {
  test("it shows only that participant's messages, and hides the plumbing", () => {
    transcript.setFilter("a");
    const visible = transcript.visible();
    expect(visible).toHaveLength(3);
    expect(visible.every((entry) => entry.kind === "message" && entry.message.from === "a")).toBe(true);
    // The system line goes: while reading one person's turns, the room's
    // connection history is not what was asked for.
    expect(visible.some((entry) => entry.kind === "system")).toBe(false);
  });

  test("clearing the filter brings everything back, system lines included", () => {
    transcript.setFilter("a");
    transcript.setFilter(null);
    expect(transcript.visible()).toHaveLength(5);
    expect(transcript.visible().some((entry) => entry.kind === "system")).toBe(true);
  });

  test("a filter on someone who has not spoken shows nothing rather than everything", () => {
    // Failing open would be the dangerous direction: it would look like the
    // filter silently did not apply.
    transcript.setFilter("nobody");
    expect(transcript.visible()).toHaveLength(0);
  });
});

describe("searching the transcript", () => {
  test("no query matches nothing at all", () => {
    expect(transcript.matches()).toEqual([]);
  });

  test("it matches the body, the speaker's display name and the kind tag", () => {
    transcript.setQuery("opening");
    expect(transcript.matches()).toEqual([0, 1]);

    transcript.setQuery("bob");
    expect(transcript.matches()).toEqual([1]);

    transcript.setQuery("challenge");
    expect(transcript.matches()).toEqual([1]);
  });

  test("it searches what is on screen, not the raw envelope", () => {
    // "Ann" is the display name; "a" is the id. Searching for the id must not
    // sweep up every message she sent.
    transcript.setQuery("Ann");
    expect(transcript.matches()).toEqual([0, 3, 4]);
  });

  test("search runs inside the filter, not around it", () => {
    transcript.setFilter("a");
    transcript.setQuery("opening");
    // Bob's message contains "opening" too, but he is filtered out.
    expect(transcript.matches()).toEqual([0]);
  });

  test("next and previous wrap, in both directions", () => {
    transcript.setQuery("Ann");
    expect(transcript.nextMatch(-1)).toBe(0);
    expect(transcript.nextMatch(0)).toBe(3);
    expect(transcript.nextMatch(4)).toBe(0);

    expect(transcript.previousMatch(4)).toBe(3);
    expect(transcript.previousMatch(0)).toBe(4);
  });

  test("a query that matches nothing returns null rather than standing still", () => {
    // The caller has to be able to say "no matches" — a search that finds
    // nothing must not look the same as one that found something.
    transcript.setQuery("nothing in here matches this");
    expect(transcript.nextMatch(0)).toBeNull();
    expect(transcript.previousMatch(0)).toBeNull();
  });
});

describe("speaker runs", () => {
  test("a run starts when the speaker changes, and a system line breaks one", () => {
    expect(transcript.startsRun(0)).toBe(true);
    expect(transcript.startsRun(1)).toBe(true);
    // index 2 is the system line
    expect(transcript.startsRun(3)).toBe(true);
    expect(transcript.startsRun(4)).toBe(false);
  });

  test("under a filter, a run is computed on what is visible", () => {
    transcript.setFilter("a");
    expect(transcript.startsRun(0)).toBe(true);
    expect(transcript.startsRun(1)).toBe(false);
    expect(transcript.startsRun(2)).toBe(false);
  });
});

describe("writing the transcript out", () => {
  test("it renders what is visible, with the tag and the indent", () => {
    transcript.setFilter("b");
    expect(transcript.toText()).toBe("Bob  challenge\n  I disagree with the opening");
  });

  test("system lines survive the trip out", () => {
    expect(transcript.toText()).toContain("— disconnected, retrying —");
  });
});
