import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The launcher that stands between npm's `bin` and roomyx's TypeScript.
 *
 * `bin` used to point straight at a `.ts` file with a `#!/usr/bin/env bun`
 * shebang. On a machine without Bun that fails as
 * `/usr/bin/env: 'bun': No such file or directory` — not one byte of it from
 * roomyx, and there is no way to make it so: a shebang is an `execve` dispatch
 * handled by the kernel, with no slot for a diagnostic and no fallback. When
 * the interpreter is not guaranteed present, the `bin` entry has to be a
 * launcher rather than the program. Node is guaranteed present; npm just ran.
 *
 * `package.json`'s `engines.bun` does not help. npm's engine check only ever
 * knew `node` and `npm` — a package declaring `bun: ">=99.0.0"` installs
 * cleanly under `--engine-strict`. It is a comment that looks like a
 * constraint.
 *
 * This does not transpile anything, and `src/*.ts` remains the shipped
 * artifact. **It also never fetches, installs or bootstraps Bun.** Making an
 * error message nicer by downloading a runtime at first use would reintroduce
 * exactly the install-time network fetch that installer D-01 exists to refuse.
 */

const MISSING_BUN = `roomyx needs Bun 1.1+ on your PATH.

It ships TypeScript and runs it directly — there is no build step, so Bun is
the interpreter rather than a build-time dependency.

  Install:  curl -fsSL https://bun.sh/install | bash
  Docs:     https://bun.sh
`;

/**
 * @param {string} entryRelativeToBin - the TypeScript entry point, e.g. "../cli.ts"
 */
export function launch(entryRelativeToBin) {
  const entry = join(dirname(fileURLToPath(import.meta.url)), entryRelativeToBin);
  const child = spawn("bun", [entry, ...process.argv.slice(2)], { stdio: "inherit" });

  // Forwarded rather than relied upon. `roomyx serve` deregisters its room on
  // SIGTERM, and a launcher that swallowed the signal would leave a registry
  // entry pointing at a process that is gone — the failure this package
  // already had once, from the other direction.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }

  child.on("error", (error) => {
    if (error.code === "ENOENT") {
      process.stderr.write(MISSING_BUN);
      process.exit(1);
    }
    throw error;
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      // Report death-by-signal the way a shell expects, rather than
      // flattening it into an exit code the caller cannot distinguish.
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
