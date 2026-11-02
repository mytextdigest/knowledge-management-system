// Runs route handlers against one interactive transaction that the test rolls
// back, so nothing reaches the shared database. src/lib/prisma.mjs exports
// globalThis.prisma when it is set, so install the proxy BEFORE importing any
// route. Nested prisma.$transaction(fn) calls run inside the same transaction.
import { PrismaClient } from "@prisma/client";

let current = null;
export const base = new PrismaClient();
globalThis.prisma = new Proxy({}, {
  get(_target, prop) {
    if (!current) throw new Error("route-harness: no test transaction is open");
    if (prop === "$transaction") {
      return (arg) => (typeof arg === "function" ? arg(current) : Promise.all(arg));
    }
    const value = current[prop];
    return typeof value === "function" ? value.bind(current) : value;
  },
});

class Rollback extends Error {}

/** Run fn(db) in a transaction that is always rolled back. */
export async function inRolledBackTransaction(fn) {
  let result;
  try {
    await base.$transaction(async (tx) => {
      current = tx;
      try { result = await fn(tx); } finally { current = null; }
      throw new Rollback();
    }, { timeout: 180_000, maxWait: 20_000 });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return result;
}

export function as(email) { globalThis.__testSessionEmail = email; }

export async function call(handler, { method = "GET", params = {}, body } = {}) {
  const init = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await handler(new Request("http://localhost/test", init), { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
