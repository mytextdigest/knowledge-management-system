import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
test("repository reports access-filtered result count and event id", () => {
 const route = read("src/app/api/org/[orgId]/repository/route.js");
 assert.match(route, /data: \{ resultCount: total \}/);
 assert.match(route, /searchEventId,/);
});
test("repository result actions record clicks and sidebar exposes admin analytics", () => {
 assert.match(read("src/app/(app)/org/[orgId]/repository/page.jsx"), /onSearchResultOpen=/);
 const card = read("src/components/repository/RepositoryDocumentCard.jsx");
 assert.match(card, /onSearchResultOpen\?\.\(\)/);
 assert.match(read("src/components/layout/AppSidebar.jsx"), /isOrgAdmin \? \[\{ label: "Search Analytics"/);
});
test("click API checks event owner and result rank", () => {
 const route = read("src/app/api/org/[orgId]/search/click/route.js");
 assert.match(route, /userId: user.id/);
 assert.match(route, /rank > event.resultCount/);
});
