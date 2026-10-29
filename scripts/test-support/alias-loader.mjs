import { pathToFileURL } from "node:url";
import { resolve as resolvePath, extname } from "node:path";
import { existsSync, statSync } from "node:fs";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = resolvePath(
      process.cwd(),
      "src",
      specifier.slice(2)
    );

    const candidates = extname(base)
      ? [base]
      : [base, `${base}.js`, `${base}.mjs`, `${base}.jsx`, resolvePath(base, "index.js")];

    const matched = candidates.find(
      (file) => existsSync(file) && statSync(file).isFile()
    );

    if (matched) {
      return nextResolve(pathToFileURL(matched).href, context);
    }
  }

  return nextResolve(specifier, context);
}
