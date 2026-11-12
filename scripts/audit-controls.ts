/** Static inventory; browser verification status is documented separately. */
import ts from "typescript";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : e.name.endsWith(".tsx")
        ? [join(dir, e.name)]
        : [],
  );
const entries: {
  file: string;
  line: number;
  control: string;
  label: string;
}[] = [];
for (const file of [...files("app"), ...files("components")]) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(n: ts.Node) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(source);
      if (
        [
          "button",
          "a",
          "input",
          "select",
          "textarea",
          "summary",
          "Dialog.Close",
        ].includes(tag)
      ) {
        const attr = n.attributes.properties.find(
          (p) =>
            ts.isJsxAttribute(p) &&
            ["aria-label", "placeholder", "href"].includes(
              p.name.getText(source),
            ),
        );
        const parent = ts.isJsxElement(n.parent)
          ? n.parent.getText(source)
          : n.getText(source);
        const label =
          attr?.getText(source) ||
          parent
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 160);
        entries.push({
          file,
          line: source.getLineAndCharacterOfPosition(n.getStart()).line + 1,
          control: tag,
          label,
        });
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(source);
}
writeFileSync(
  "docs/CONTROL-INVENTORY.json",
  JSON.stringify(
    {
      description:
        "Static control sites, including dynamic controls. This is an inventory, not a claim that every permutation was clicked. See WORKSPACE-VERIFICATION.md for evidence.",
      controls: entries,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Inventoried ${entries.length} control sites across ${new Set(entries.map((e) => e.file)).size} components.`,
);
