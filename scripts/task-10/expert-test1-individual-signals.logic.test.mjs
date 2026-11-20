// Suggestion doc Test 1 - "Individual scoring tests": each signal, alone,
// must produce exactly its documented per-action point value. No DB, no
// accounts - this calls the scoring function directly.
import test from "node:test";
import assert from "node:assert/strict";
import { computeExpertiseScore } from "../../src/lib/expertiseScoringPolicy.mjs";

// lastSignalAt = now on every case below, so decay is ~1.0 and the raw
// per-signal weight is exactly what shows up in the score.
const now = Date.UTC(2026, 8, 15);
const at = (v) => ({ ...v, lastSignalAt: new Date(now) });
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: got ${actual}, expected ${expected}`);

test("1 upload alone scores 0.5", () => close(computeExpertiseScore(at({ uploads: 1 }), now), 0.5, "uploads"));
test("1 citation alone scores 0.35", () => close(computeExpertiseScore(at({ citations: 1 }), now), 0.35, "citations"));
test("1 department overlap alone scores 0.25", () => close(computeExpertiseScore(at({ departments: 1 }), now), 0.25, "departments"));
test("1 view/download interaction alone scores 0.15", () => close(computeExpertiseScore(at({ interactions: 1 }), now), 0.15, "interactions"));
test("1 document question alone scores 0.4", () => close(computeExpertiseScore(at({ documentQuestions: 1 }), now), 0.4, "documentQuestions"));
test("1 published lesson authored alone scores 2.0", () => close(computeExpertiseScore(at({ lessonsAuthored: 1 }), now), 2.0, "lessonsAuthored"));
test("10 minutes of dwell time alone scores 1.0", () => close(computeExpertiseScore(at({ dwellMinutes: 10 }), now), 1.0, "dwellMinutes"));
test("no signals at all scores 0", () => close(computeExpertiseScore(at({}), now), 0, "empty"));
