import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canManageProjectLink, normalizeProjectLinkStatus } from "../../src/lib/knowledgeContextPolicy.js";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("related-document route grants full bypass only to super_admin", async () => {
  const route = await read("src/app/api/documents/[id]/route.js");
  assert.match(route, /isSuperAdmin:\s*isSuperAdmin\(role\)/);
  assert.doesNotMatch(route, /isSuperAdmin:\s*isOrgAdmin\(role\)/);
});

test("context SQL protects drafts, department documents, and private ownership", async () => {
  const source = await read("src/lib/knowledgeContext.js");
  assert.match(source, /lifecycle = 'published'/);
  assert.match(source, /DepartmentMember/);
  assert.match(source, /"userId" = \$\{userId\}/);
  assert.match(source, /Project/);
});

test("expert lookup applies the same access SQL before aggregation", async () => {
  const source = await read("src/lib/knowledgeContext.js");
  const expertFunction = source.slice(source.indexOf("export async function getAccessibleExperts"));
  assert.match(expertFunction, /AND \$\{access\}/);
});

test("project suggestions accept only one-click terminal states", () => {
  assert.equal(normalizeProjectLinkStatus("confirmed"), "confirmed");
  assert.equal(normalizeProjectLinkStatus("dismissed"), "dismissed");
  assert.equal(normalizeProjectLinkStatus("suggested"), null);
});

test("only admins or the uploader can manage a project suggestion", () => {
  assert.equal(canManageProjectLink({ role: "super_admin", documentUserId: "a", userId: "b" }), true);
  assert.equal(canManageProjectLink({ role: "dept_admin", documentUserId: "a", userId: "b" }), true);
  assert.equal(canManageProjectLink({ role: "member", documentUserId: "a", userId: "a" }), true);
  assert.equal(canManageProjectLink({ role: "member", documentUserId: "a", userId: "b" }), false);
});

test("relationship worker uses bounded pgvector KNN instead of a full embedding scan", async () => {
  const worker = await read("worker/knowledgeContext.js");
  assert.match(worker, /embedding_vec <=> source\.embedding_vec/);
  assert.match(worker, /CROSS JOIN LATERAL/);
  assert.doesNotMatch(worker, /take:\s*1000/);
  assert.doesNotMatch(worker, /include:\s*\{chunks:/);
});

test("repository topics reuse the established cluster implementation", async () => {
  const worker = await read("worker/knowledgeContext.js");
  const cluster = await read("worker/cluster.js");
  assert.match(worker, /classifyRepositoryDocument/);
  assert.match(cluster, /export async function classifyRepositoryDocument/);
  assert.match(cluster, /generateTopicName/);
  assert.match(cluster, /bhattacharyya/);
});

test("expertise combines upload, citation, and department signals", async () => {
  const worker = await read("worker/knowledgeContext.js");
  assert.match(worker, /uploaderSignals/);
  assert.match(worker, /citerSignals/);
  assert.match(worker, /departmentSignals/);
  assert.match(worker, /signals\.uploads/);
  assert.match(worker, /signals\.citations/);
  assert.match(worker, /signals\.departments/);
});
