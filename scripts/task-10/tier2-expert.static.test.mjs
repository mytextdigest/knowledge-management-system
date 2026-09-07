import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(p, "utf8");

test("10-A expert schema includes confirmation, recency, and interaction contract fields", () => {
  const s = read("prisma/schema.prisma");
  for (const token of ["source       String", "confirmedBy", "lastSignalAt", "model DocumentInteraction", "documentId String", "userId     String", "orgId      String", "createdAt  DateTime"]) {
    assert.ok(s.includes(token), token);
  }
  assert.ok(fs.existsSync("prisma/migrations/20260906000000_add_tier2_expert_recommendation/migration.sql"));
});

test("10-B/10-C expert query branches repository/project RBAC and blocks cross-department association leakage", () => {
  const s = read("src/lib/expertDiscoveryQuery.mjs");
  assert.match(s, /t\.scope = 'repository'/);
  assert.match(s, /t\.scope = 'project'/);
  assert.match(s, /viewer_dm/);
  assert.match(s, /expert_dm/);
  assert.match(s, /viewer_pm/);
  assert.match(s, /expert_pm/);
  assert.match(s, /te\.source <> 'dismissed'/);
  assert.match(s, /isExpertTopicAccessibleWithPrisma/);
});

test("10-D confirmation route uses topic RBAC without requiring a pre-existing expert row", () => {
  const s = read("src/app/api/org/[orgId]/context/experts/[topicId]/route.js");
  assert.match(s, /isExpertTopicAccessibleWithPrisma/);
  assert.doesNotMatch(s, /visible\.some/);
  assert.match(s, /canManageDepartment/);
  assert.match(s, /admin_confirmed/);
  assert.match(s, /dismissed/);
});

test("10-E expert refresh uses only real view/download activity, applies decay, and protects manual state", () => {
  const s = read("worker/knowledgeContext.js");
  assert.match(s, /DocumentInteraction/);
  assert.match(s, /di\.type IN \('view', 'download'\)/);
  assert.match(s, /computeExpertiseScore/);
  assert.match(read("src/lib/expertiseScoringPolicy.mjs"), /EXPERTISE_HALF_LIFE_DAYS = 90/);
  assert.match(s, /current\.source !== 'inferred'/);
  assert.match(s, /current\?\.source === 'dismissed'/);
});

test("10-F includes real DB-backed RBAC regression test", () => {
  const s = read("scripts/task-10/expert-rbac.integration.test.mjs");
  assert.match(s, /PrismaClient/);
  assert.match(s, /cross-department/);
  assert.match(s, /Shared Topic/);
  assert.match(s, /assert\.equal/);
});

test("10-B/10-G standalone directory and document expert surfaces remain reachable", () => {
  const expertsPage = read("src/app/(app)/org/[orgId]/experts/page.jsx");
  const sidebar = read("src/components/layout/AppSidebar.jsx");
  assert.match(expertsPage, /Expert Directory/);
  assert.match(expertsPage, /mailto:/);
  assert.match(sidebar, /\/experts/);
  assert.match(read("src/app/(app)/document/page.jsx"), /People who know this/);
  assert.match(read("src/app/api/documents/[id]/route.js"), /getAccessibleExperts/);
});
