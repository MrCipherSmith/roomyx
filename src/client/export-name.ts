import { dirname, resolve } from "node:path";

/**
 * Where a transcript export is allowed to land, and under what name.
 *
 * Pure on purpose: it takes an `exists` predicate rather than touching the
 * filesystem, so the never-overwrite loop and the containment check are
 * testable without a terminal, a room or a temp directory. The version inside
 * `runClient` was reachable by no test at all — a mutation that changed its
 * `wx` to `w`, making it silently overwrite, left all 201 tests passing.
 */

const MAX_ATTEMPTS = 100;

/**
 * A participant id is text from the room log — chosen by whoever wrote that
 * log, which is the dispatcher or any agent that can append to it. Interpolated
 * into a filename and handed to `join`, an id of `../../../../../tmp/pwned`
 * made the operator's `w` keypress write to `/tmp/pwned.txt` while the status
 * bar reported `./roomyx-transcript-…`, telling them the opposite of what had
 * happened.
 *
 * So the id is reduced to characters that cannot mean anything to a path, and
 * the result is checked against the working directory anyway. Two independent
 * defences, because the first is a transformation and the second is a fact.
 */
export function exportBaseName(filterId: string | null): string {
  if (filterId === null) return "roomyx-transcript";
  const slug = filterId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug === "" ? "roomyx-transcript-filtered" : `roomyx-transcript-${slug}`;
}

export type ExportTarget =
  | { ok: true; path: string; name: string }
  | { ok: false; reason: "exhausted" | "escapes-cwd" };

/**
 * The first free `<base>.txt`, `<base>-1.txt`, … under `cwd`.
 *
 * Never overwrites: silently replacing an export someone took a minute ago is
 * the kind of small theft a keystroke should not be able to commit. Returns a
 * reason rather than throwing, so the caller can say which of the two things
 * went wrong.
 */
export function nextFreeExportPath(cwd: string, base: string, exists: (path: string) => boolean): ExportTarget {
  const root = resolve(cwd);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const name = `${base}${attempt === 0 ? "" : `-${attempt}`}.txt`;
    const path = resolve(root, name);
    // The fact, checked after the transformation rather than instead of it —
    // and this time it is actually a check. The first version compared `path`
    // against the identical expression that had produced it one line earlier,
    // which is unsatisfiable, and paired it with a `startsWith(root + sep)`
    // test that inverted to always-false when `root` was `/`: started in a
    // container with no working directory, every export was refused with
    // "refusing to write outside the working directory", which is the opposite
    // of what had happened.
    //
    // `dirname` equality holds at the filesystem root and is genuinely
    // falsifiable the moment `name` regains a separator or a `..` segment —
    // which is what the sanitiser above is for, and what this is here to catch
    // if that sanitiser is ever loosened.
    if (dirname(path) !== resolve(root)) return { ok: false, reason: "escapes-cwd" };
    if (!exists(path)) return { ok: true, path, name };
  }
  return { ok: false, reason: "exhausted" };
}
