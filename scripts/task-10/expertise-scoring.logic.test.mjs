import test from "node:test";
import assert from "node:assert/strict";
import { computeExpertiseScore, expertiseDecayWeight, EXPERTISE_HALF_LIFE_DAYS } from "../../src/lib/expertiseScoringPolicy.mjs";

test("90-day half-life reduces stale expertise and lets recent activity outrank old volume", () => {
  const now = Date.UTC(2026, 8, 6);
  const recent = computeExpertiseScore({ uploads: 2, lastSignalAt: new Date(now - 7 * 86400000) }, now);
  const staleHeavy = computeExpertiseScore({ uploads: 10, lastSignalAt: new Date(now - 365 * 86400000) }, now);
  assert.equal(EXPERTISE_HALF_LIFE_DAYS, 90);
  assert.ok(expertiseDecayWeight(new Date(now - 180 * 86400000), now) < 0.26);
  assert.ok(recent > staleHeavy, `expected recent ${recent} > stale ${staleHeavy}`);
});
