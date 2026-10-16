// Suggestion doc Test 8 - "Recency decay": a score fades on a 90-day
// half-life, and re-activity resets the clock. No DB, no accounts - calls
// the decay/scoring functions directly with a fixed `now`.
import test from "node:test";
import assert from "node:assert/strict";
import { computeExpertiseScore, expertiseDecayWeight, EXPERTISE_HALF_LIFE_DAYS } from "../../src/lib/expertiseScoringPolicy.mjs";

const now = Date.UTC(2026, 8, 15);
const daysAgo = (n) => new Date(now - n * 86400000);
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 0.05, `${msg}: got ${actual}, expected ~${expected}`);

test("half-life constant is 90 days", () => assert.equal(EXPERTISE_HALF_LIFE_DAYS, 90));

test("decay weight matches the suggestion doc's table for a raw score of 10", () => {
  const raw = 10;
  const table = [
    [0, 10.00],
    [30, 7.94],
    [90, 5.00],
    [180, 2.50],
    [270, 1.25],
    [360, 0.63],
  ];
  for (const [days, expected] of table) {
    close(raw * expertiseDecayWeight(daysAgo(days), now), expected, `${days} days inactive`);
  }
});

test("computeExpertiseScore applies the same decay to a real signal set", () => {
  // 2 published lessons = raw 4.0 (the category cap), before decay.
  const signals = (days) => ({ lessonsAuthored: 2, lastSignalAt: daysAgo(days) });
  close(computeExpertiseScore(signals(0), now), 4.00, "fresh");
  close(computeExpertiseScore(signals(90), now), 2.00, "90 days stale");
  close(computeExpertiseScore(signals(180), now), 1.00, "180 days stale");
});

test("no lastSignalAt at all is treated as a 0.5x fallback, not full strength", () => {
  // computeExpertiseScore/expertiseDecayWeight fall back to 0.5x when there's
  // no timestamp to decay from - documented here so future signal work
  // doesn't assume an unset lastSignalAt means "brand new".
  close(computeExpertiseScore({ lessonsAuthored: 2 }, now), 2.00, "missing lastSignalAt");
});

test("new activity resets the decay clock (a stale heavy contributor can be outranked by a small recent signal)", () => {
  const recentButSmall = computeExpertiseScore({ uploads: 2, lastSignalAt: daysAgo(7) }, now);
  const heavyButStale = computeExpertiseScore({ uploads: 10, lastSignalAt: daysAgo(365) }, now);
  assert.ok(recentButSmall > heavyButStale, `expected recent ${recentButSmall} > stale ${heavyButStale}`);
});
