import { readdir, rm, cp } from "node:fs/promises";
// Next's standalone copier includes loaded env files independently of tracing.
// Runtime secrets must be injected on the server, never shipped in an artifact.
for (const name of await readdir(".next/standalone"))
  if (name === ".env" || name.startsWith(".env."))
    await rm(`.next/standalone/${name}`);

await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
await cp("public", ".next/standalone/public", { recursive: true });
