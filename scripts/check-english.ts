import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import en from "../src/i18n/en.json";
import { normalizeText } from "../src/i18n/core";

// These components provide their own explicit fa/en/ar language branches.
const localeBranches = new Set([
  "app/layout.tsx",
  "src/i18n/SiteLocale.tsx",
  "src/commerce/ThemeToggle.tsx",
]);
const letters = /[\u0621-\u063a\u0641-\u064a\u0671-\u06d3]/;
export function englishCoverage(root = process.cwd()) {
  const messages = new Map<string, Set<string>>();
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name),
        name = relative(root, file).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        scan(file);
        continue;
      }
      if (
        !/\.(ts|tsx)$/.test(name) ||
        /\.(test|stories)\./.test(name) ||
        localeBranches.has(name)
      )
        continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function add(text: string, node: ts.Node) {
        const key = normalizeText(text);
        // Normalisation characters and SQL schema definitions are not UI copy.
        if (key.length < 2 || !letters.test(key) || /^CREATE TABLE /i.test(key))
          return;
        if (!messages.has(key)) messages.set(key, new Set());
        messages
          .get(key)!
          .add(
            `${name}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
          );
      }
      function visit(node: ts.Node) {
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
          !(
            ts.isBinaryExpression(node.parent) &&
            node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
          )
        ) {
          let index = 0;
          const flatten = (part: ts.Expression): string =>
            ts.isBinaryExpression(part) &&
            part.operatorToken.kind === ts.SyntaxKind.PlusToken
              ? flatten(part.left) + flatten(part.right)
              : ts.isStringLiteralLike(part)
                ? part.text
                : `{${index++}}`;
          const text = flatten(node);
          if (!/^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(text.trim()))
            add(text, node);
        } else if (ts.isTemplateExpression(node)) {
          let text = node.head.text;
          node.templateSpans.forEach((span, i) => {
            text += `{${i}}${span.literal.text}`;
          });
          add(text, node);
        } else if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isJsxText(node)
        )
          add(node.text, node);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(join(root, "app"));
  scan(join(root, "src"));
  return {
    total: messages.size,
    missing: [...messages]
      .filter(([key]) => !Object.hasOwn(en, key))
      .map(([text, files]) => ({ text, files: [...files] })),
  };
}
if (process.argv[1]?.endsWith("check-english.ts")) {
  const result = englishCoverage();
  console.log(
    `Checked ${result.total} source messages; ${result.missing.length} missing English translations.`,
  );
  for (const item of result.missing)
    console.error(`${item.files[0]}: ${item.text}`);
  if (result.missing.length) process.exitCode = 1;
}
