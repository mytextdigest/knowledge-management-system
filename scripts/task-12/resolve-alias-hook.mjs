// Rewrites the `@/*` -> `./src/*` alias (jsconfig.json, webpack-only) so
// `node --test` can import src/lib modules directly for integration testing,
// without changing those modules' imports away from this project's normal
// `@/lib/...` convention.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = `../../src/${specifier.slice(2)}`;
    const hasExtension = /\.[a-z]+$/i.test(specifier);
    const candidates = hasExtension ? [base] : [`${base}.js`, `${base}.mjs`];
    let lastError;
    for (const candidate of candidates) {
      try {
        return await nextResolve(new URL(candidate, import.meta.url).href, context);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }
  return nextResolve(specifier, context);
}
