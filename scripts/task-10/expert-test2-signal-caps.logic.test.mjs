// Suggestion doc Test 2 - "Verify every cap": no signal may exceed its
// documented ceiling, no matter how many times the underlying action
// happens. No DB, no accounts - calls the scoring function directly.
import test from "node:test";
import assert from "node:assert/strict";
import { computeExpertiseScore } from "../../src/lib/expertiseScoringPolicy.mjs";

const now = Date.UTC(2026, 8, 15);
const at = (v) => ({ ...v, lastSignalAt: new Date(now) });
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: got ${actual}, expected ${expected}`);

test("lessonsAuthored caps at 4.0", () => {
  close(computeExpertiseScore(at({ lessonsAuthored: 0 }), now), 0, "0 lessons");
  close(computeExpertiseScore(at({ lessonsAuthored: 1 }), now), 2.0, "1 lesson");
  close(computeExpertiseScore(at({ lessonsAuthored: 2 }), now), 4.0, "2 lessons");
  close(computeExpertiseScore(at({ lessonsAuthored: 3 }), now), 4.0, "3 lessons (capped)");
  close(computeExpertiseScore(at({ lessonsAuthored: 10 }), now), 4.0, "10 lessons (capped)");
});

test("uploads caps at 1.5", () => {
  close(computeExpertiseScore(at({ uploads: 1 }), now), 0.5, "1 upload");
  close(computeExpertiseScore(at({ uploads: 2 }), now), 1.0, "2 uploads");
  close(computeExpertiseScore(at({ uploads: 3 }), now), 1.5, "3 uploads");
  close(computeExpertiseScore(at({ uploads: 4 }), now), 1.5, "4 uploads (capped)");
  close(computeExpertiseScore(at({ uploads: 20 }), now), 1.5, "20 uploads (capped)");
});

test("citations caps at 2.0", () => {
  close(computeExpertiseScore(at({ citations: 5 }), now), 1.75, "5 citations");
  close(computeExpertiseScore(at({ citations: 6 }), now), 2.0, "6 citations (capped, would be 2.1 uncapped)");
  close(computeExpertiseScore(at({ citations: 20 }), now), 2.0, "20 citations (capped)");
});

test("department overlap caps at 0.5", () => {
  close(computeExpertiseScore(at({ departments: 2 }), now), 0.5, "2 departments");
  close(computeExpertiseScore(at({ departments: 3 }), now), 0.5, "3 departments (capped)");
});

test("view/download interactions cap at 1.5", () => {
  close(computeExpertiseScore(at({ interactions: 10 }), now), 1.5, "10 interactions");
  close(computeExpertiseScore(at({ interactions: 11 }), now), 1.5, "11 interactions (capped)");
});

test("document questions cap at 3.0", () => {
  close(computeExpertiseScore(at({ documentQuestions: 7 }), now), 2.8, "7 questions");
  close(computeExpertiseScore(at({ documentQuestions: 8 }), now), 3.0, "8 questions (capped, would be 3.2 uncapped)");
  close(computeExpertiseScore(at({ documentQuestions: 20 }), now), 3.0, "20 questions (capped)");
});

test("dwell time caps at 3.0", () => {
  close(computeExpertiseScore(at({ dwellMinutes: 30 }), now), 3.0, "30 minutes");
  close(computeExpertiseScore(at({ dwellMinutes: 40 }), now), 3.0, "40 minutes (capped)");
});

test("every signal maxed out at once still sums each capped, not uncapped", () => {
  const maxed = computeExpertiseScore(at({
    uploads: 100, citations: 100, departments: 100, interactions: 100,
    documentQuestions: 100, lessonsAuthored: 100, dwellMinutes: 1000,
  }), now);
  // 1.5 + 2.0 + 0.5 + 1.5 + 3.0 + 4.0 + 3.0 = 15.5, per the redesign proposal's stated theoretical max.
  close(maxed, 15.5, "fully maxed score");
});
