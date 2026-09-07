import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(p, "utf8");

test("11-A recommendation surface is visibly reachable and placement is documented", () => {
  const page = read("src/app/(app)/org/[orgId]/recommendations/page.jsx");
  const sidebar = read("src/components/layout/AppSidebar.jsx");
  const handoff = read("TIER2_SIMRAN_SANDEEP_HANDOFF.md");
  assert.match(page, /Knowledge Recommendations/);
  assert.match(sidebar, /\/recommendations/);
  assert.match(handoff, /dedicated, sidebar-reachable \*\*Knowledge Recommendations\*\* page/);
});

test("11-B/11-C document interaction schema and best-effort RBAC-safe write path exist", () => {
  const schema = read("prisma/schema.prisma");
  const page = read("src/app/(app)/document/page.jsx");
  const route = read("src/app/api/documents/[id]/interactions/route.js");
  assert.match(schema, /model DocumentInteraction/);
  assert.match(schema, /@@index\(\[documentId, type\]\)/);
  assert.match(schema, /@@index\(\[userId, createdAt\]\)/);
  assert.match(page, /\/interactions/);
  assert.match(page, /keepalive: true/);
  assert.match(route, /isSuperAdmin/);
  assert.match(route, /doc\.project\.scope === "org"/);
  assert.doesNotMatch(route, /isOrgAdmin/);
});

test("11-D/11-E recommendations use requesting-user feedback and existing relationship graph", () => {
  const s = read("src/lib/recommendations.js");
  assert.match(s, /conversation: \{ orgId, userId \}/);
  const policy = read("src/lib/recommendationRankingPolicy.mjs");
  assert.match(policy, /not_helpful/);
  assert.match(policy, /-0\.12/);
  assert.match(s, /expandWithRelatedDocuments/);
  assert.match(s, /type: \{ in: \["view", "download"\] \}/);
});

test("11-F department trending includes repository and org-project documents", () => {
  const s = read("src/lib/recommendations.js");
  assert.match(s, /COALESCE\(d\."departmentId", p\."departmentId"\)/);
  assert.match(s, /p\.scope = 'org'/);
  assert.match(s, /di\.type IN \('view', 'download'\)/);
  const route = read("src/app/api/org/[orgId]/recommendations/route.js");
  assert.match(route, /canManageDepartment/);
});

test("11-G effectiveness is aggregate-only, project-aware, and visible to admins", () => {
  const route = read("src/app/api/org/[orgId]/recommendations/effectiveness/route.js");
  const page = read("src/app/(app)/org/[orgId]/recommendations/page.jsx");
  assert.match(route, /COUNT\(\*\)::int AS impressions/);
  assert.match(route, /COUNT\(\*\)::int AS engagements/);
  assert.match(route, /COALESCE\(d\."departmentId", p\."departmentId"\)/);
  assert.doesNotMatch(route, /userId.*SELECT/i);
  assert.match(page, /Recommendation impressions/);
  assert.match(page, /Zero-click documents/);
  assert.match(page, /Most recommended documents/);
  assert.match(page, /\?mine=1/);
});

test("11-H keeps ORG_OPENAI_KEY_MISSING explicit rather than returning an empty feed", () => {
  const lib = read("src/lib/recommendations.js");
  const route = read("src/app/api/org/[orgId]/recommendations/route.js");
  assert.match(lib, /ORG_OPENAI_KEY_MISSING/);
  assert.match(route, /status: 400/);
});
