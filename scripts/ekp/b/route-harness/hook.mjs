// Route-level DB tests for Workstream B: `@/` alias (as in task-12's hook)
// plus "next-auth" -> a stub whose session the test sets.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next-auth") return nextResolve(new URL("./next-auth-stub.mjs", import.meta.url).href, context);
  // Next resolves "next/server" itself; plain Node needs the file name.
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  if (specifier.startsWith("@/")) {
    const base = `../../../../src/${specifier.slice(2)}`;
    const candidates = /\.[a-z]+$/i.test(specifier) ? [base] : [`${base}.js`, `${base}.mjs`, `${base}/index.js`];
    let lastError;
    for (const candidate of candidates) {
      try { return await nextResolve(new URL(candidate, import.meta.url).href, context); } catch (err) { lastError = err; }
    }
    throw lastError;
  }
  return nextResolve(specifier, context);
}
