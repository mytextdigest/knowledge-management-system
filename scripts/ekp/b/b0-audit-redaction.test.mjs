import test from "node:test";
import assert from "node:assert/strict";
import { redactAuditValue } from "../../../src/lib/audit/redact.mjs";

test("redacts nested secrets, preserving ordinary before/after values", () => {
  const input = { status: "draft", clientSecret: "hidden", nested: [{ api_key: "hidden", name: "safe" }], headers: { authorization: "Bearer x" } };
  assert.deepEqual(redactAuditValue(input), { status: "draft", clientSecret: "[REDACTED]", nested: [{ api_key: "[REDACTED]", name: "safe" }], headers: { authorization: "[REDACTED]" } });
  assert.equal(input.clientSecret, "hidden");
});

test("handles null, dates and circular references", () => {
  const x = { created: new Date("2026-10-19T00:00:00Z"), empty: null }; x.self = x;
  assert.deepEqual(redactAuditValue(x), { created: "2026-10-19T00:00:00.000Z", empty: null, self: "[Circular]" });
});
