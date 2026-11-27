import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
test("version list enforces management access", () => {
 const src = read("src/app/api/documents/[id]/versions/route.js");
 assert.match(src, /resolveDocumentManagementAccess/);
 assert.match(src, /!access.canManage/);
});
test("restore snapshots current version and requeues processing", () => {
 const src = read("src/app/api/documents/[id]/versions/[versionId]/restore/route.js");
 assert.match(src, /snapshotVersion/); assert.match(src, /SendMessageCommand/);
});
test("soft delete cancels workflow tasks and instances", () => {
 const src = read("src/app/api/documents/[id]/route.js");
 assert.match(src, /workflowTask.updateMany/); assert.match(src, /WORKFLOW_CANCELLED/);
});
test("supersession accepts spec field byDocumentId", () => {
 assert.match(read("src/app/api/documents/[id]/supersede/route.js"), /body\?\.byDocumentId/);
});
