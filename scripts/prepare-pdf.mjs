import { cp, mkdir, readFile } from "node:fs/promises";
const pkg = JSON.parse(
  await readFile("node_modules/pdfjs-dist/package.json", "utf8"),
);
const target = `public/pdfjs/${pkg.version}`;
await mkdir(target, { recursive: true });
await cp(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  `${target}/pdf.worker.min.mjs`,
);
for (const directory of ["cmaps", "standard_fonts", "wasm"])
  await cp(`node_modules/pdfjs-dist/${directory}`, `${target}/${directory}`, {
    recursive: true,
  });
await cp("node_modules/pdfjs-dist/LICENSE", `${target}/LICENSE`);
