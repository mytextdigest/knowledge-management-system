// A-4: one NextAuth configuration, no database adapter.
// Run: npm run ekp:a1:test   (the DB-backed checks need EKP_DB_TESTS=1)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { authOptions } from "../../src/lib/auth.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the route handler uses the shared authOptions", () => {
  const route = read("src/app/api/auth/[...nextauth]/route.js");
  assert.match(route, /import \{ authOptions \} from "@\/lib\/auth"/);
  assert.match(route, /NextAuth\(authOptions\)/);
  assert.doesNotMatch(route, /providers:/);
});

test("no database adapter, JWT sessions", () => {
  assert.equal(authOptions.adapter, undefined);
  assert.equal(authOptions.session.strategy, "jwt");
});

test("password and one-time-code providers are both registered", () => {
  const ids = authOptions.providers.map((p) => p.options?.id ?? p.id);
  assert.ok(ids.includes("credentials"), `providers: ${ids}`);
  assert.ok(ids.includes("otp"), `providers: ${ids}`);
});

test("session exposes the user id from either token field", async () => {
  const s1 = await authOptions.callbacks.session({ session: { user: {} }, token: { id: "u1", sub: "x" } });
  assert.equal(s1.user.id, "u1");
  const s2 = await authOptions.callbacks.session({ session: { user: {} }, token: { sub: "u2" } });
  assert.equal(s2.user.id, "u2");
});

test("unknown email and unknown code are rejected (read-only)", { skip: !RUN_DB_TESTS }, async () => {
  const [credentials, otp] = ["credentials", "otp"].map((id) =>
    authOptions.providers.find((p) => (p.options?.id ?? p.id) === id).options);
  const email = `nobody-${Date.now()}@example.test`;
  await assert.rejects(credentials.authorize({ email, password: "x" }), /No user found/);
  assert.equal(await otp.authorize({ email, otp: "000000" }), null);
});
