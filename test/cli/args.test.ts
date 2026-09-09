import { describe, expect, test } from "bun:test";
import { ArgError, parseArgs, renderFlags } from "../../src/cli/args";
import type { FlagSpecs } from "../../src/cli/args";

const SERVE: FlagSpecs = {
  port: { type: "number", describe: "Listen port" },
  host: { type: "string", describe: "Bind address" },
  registry: { type: "string", describe: "Registry file" },
  "dry-run": { type: "boolean", describe: "Report only" },
};

/**
 * Each case here is a behaviour measured against the published 0.4.0, where
 * two hand-rolled scanners disagreed with each other and with any convention.
 */
describe("argument grammar — the regressions it exists to prevent", () => {
  test("options before positionals: the file is the file, not the flag", () => {
    // 0.4.0 served a file literally named "--port", on the default port.
    const { positionals, flags } = parseArgs(["--port", "0", "room.jsonl"], SERVE);
    expect(positionals).toEqual(["room.jsonl"]);
    expect(flags.port).toBe(0);
  });

  test("--help is a request for help, not a command that runs", () => {
    // 0.4.0's `roomyx serve --help` started a server and minted a room ID.
    expect(parseArgs(["--help"], SERVE).help).toBe(true);
    expect(parseArgs(["-h"], SERVE).help).toBe(true);
    expect(parseArgs(["--help"], SERVE).positionals).toEqual([]);
  });

  test("a flag with no value is an error, not the number 1", () => {
    // 0.4.0: `--port` with nothing after it became port 1, via Number(true).
    expect(() => parseArgs(["room.jsonl", "--port"], SERVE)).toThrow(ArgError);
    expect(() => parseArgs(["room.jsonl", "--port"], SERVE)).toThrow("--port needs a value");
  });

  test("a flag whose value is another flag is an error, not a silent misread", () => {
    expect(() => parseArgs(["--port", "--host", "x"], SERVE)).toThrow("--port needs a value");
  });

  test("a non-numeric port is refused, not turned into an ephemeral one", () => {
    // 0.4.0: Number("abc") is NaN, which fell through to a random port.
    expect(() => parseArgs(["--port", "abc"], SERVE)).toThrow('--port needs a number (got "abc")');
  });

  test("an unknown flag is refused with a suggestion, not ignored", () => {
    // 0.4.0 silently ignored --dryrun, so the run did the opposite of the ask.
    expect(() => parseArgs(["--dryrun"], SERVE)).toThrow("Unknown flag --dryrun");
    expect(() => parseArgs(["--dryrun"], SERVE)).toThrow("Did you mean --dry-run?");
  });

  test("a wholly unrelated flag is still refused, just without a guess", () => {
    let message = "";
    try {
      parseArgs(["--quantum"], SERVE);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("Unknown flag --quantum");
    expect(message).not.toContain("Did you mean");
    expect(message).toContain("Known flags:");
  });

  test("a bare --registry does not resolve to the empty string", () => {
    // client/index.ts wrote `""` for a trailing flag, and `?? default` does not
    // catch an empty string, so the client resolved rooms from a path of "".
    expect(() => parseArgs(["--registry"], SERVE)).toThrow("--registry needs a value");
    expect(() => parseArgs(["--registry="], SERVE)).toThrow("--registry needs a value");
  });
});

describe("argument grammar — ordinary shapes", () => {
  test("--flag=value and --flag value mean the same thing", () => {
    expect(parseArgs(["--host=1.2.3.4"], SERVE).flags.host).toBe("1.2.3.4");
    expect(parseArgs(["--host", "1.2.3.4"], SERVE).flags.host).toBe("1.2.3.4");
  });

  test("switches take no value, and --switch=false turns them off", () => {
    expect(parseArgs(["--dry-run"], SERVE).flags["dry-run"]).toBe(true);
    expect(parseArgs(["--dry-run=false"], SERVE).flags["dry-run"]).toBe(false);
    expect(() => parseArgs(["--dry-run=maybe"], SERVE)).toThrow("takes no value");
  });

  test("-- ends flag parsing, so a filename may start with dashes", () => {
    const { positionals, flags } = parseArgs(["--port", "0", "--", "--weird-name.jsonl"], SERVE);
    expect(positionals).toEqual(["--weird-name.jsonl"]);
    expect(flags.port).toBe(0);
  });

  test("port 0 survives, because 0 is a real port request and not a missing value", () => {
    expect(parseArgs(["--port", "0"], SERVE).flags.port).toBe(0);
  });

  test("renderFlags produces an aligned table for --help", () => {
    const rendered = renderFlags(SERVE);
    expect(rendered).toContain("--port");
    expect(rendered).toContain("Listen port");
    // Aligned: every description starts at the same column, so a long flag
    // name does not push its neighbour's text out of line.
    const columns = rendered.split("\n").map((line) => {
      const describe = /^\s*--\S+\s+(.*)$/.exec(line)?.[1] ?? "";
      return line.length - describe.length;
    });
    expect(new Set(columns).size).toBe(1);
  });
});
