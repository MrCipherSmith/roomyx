#!/usr/bin/env node
import { launch } from "./launch.mjs";

// The TUI's own entry, not `cli.ts client`. `client/index.ts` decides whether
// it was run directly via `import.meta.main`, and `cli.ts`'s `client`
// subcommand depends on that being false when it does `await import()`. A
// launcher pointed at the wrong one would run the client twice.
launch("../client/index.ts");
