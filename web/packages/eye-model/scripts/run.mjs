// Run a TypeScript entry of this package in Node through Vite's module runner, which resolves
// the JSON imports and extensionless specifiers the sources use. The entry must export
// `main(argv: string[]): Promise<void> | void`.
//
//   node scripts/run.mjs scripts/export-forces.ts --grid 5 --out ...
import { resolve } from "node:path";
import { runnerImport } from "vite";

const [entry, ...argv] = process.argv.slice(2);
if (!entry) {
  console.error("usage: node scripts/run.mjs <entry.ts> [args...]");
  process.exit(2);
}
const { module } = await runnerImport(resolve(process.cwd(), entry));
if (typeof module.main !== "function") {
  console.error(`${entry} does not export main(argv)`);
  process.exit(2);
}
await module.main(argv);
