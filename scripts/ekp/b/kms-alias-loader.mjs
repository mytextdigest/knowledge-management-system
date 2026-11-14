import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";

const root = fileURLToPath(new URL("../../../", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const target = resolvePath(root, "src", specifier.slice(2));

  const candidates = [
    target,
    `${target}.js`,
    `${target}.mjs`,
    `${target}.json`,
    resolvePath(target, "index.js"),
    resolvePath(target, "index.mjs")
  ];

  const match = candidates.find(existsSync);

  if (!match) {
    throw new Error(`Cannot resolve KMS alias: ${specifier}`);
  }

  return nextResolve(pathToFileURL(match).href, context);
}
