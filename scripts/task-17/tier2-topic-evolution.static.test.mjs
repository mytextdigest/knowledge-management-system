import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";const read=p=>fs.readFileSync(p,"utf8");

test("17-B TopicSnapshot is additive with a stable topicRef surviving Topic deletion",()=>{const s=read("prisma/schema.prisma");assert.match(s,/model TopicSnapshot \{/);assert.match(s,/topicRef\s+String/);assert.match(s,/topicId\s+String\?/);assert.match(s,/onDelete: SetNull/);assert.match(s,/@@unique\(\[topicRef, periodStart\]\)/);});

test("17-C capture job is a standalone script, weekly-keyed, upserting for idempotency",()=>{const s=read("scripts/task-17/capture-topic-snapshots.mjs");assert.match(s,/scope: "repository"/);assert.match(s,/isoWeekStart/);assert.match(s,/topicSnapshot\.upsert/);assert.match(s,/topicRef_periodStart/);const pkg=JSON.parse(read("package.json"));assert.ok(pkg.scripts["task17:capture-snapshots"]);});

test("17-D lifecycle: snapshot RBAC footprint is denormalized so retired-topic access doesn't need a live TopicDocument join",()=>{const s=read("src/lib/topicSnapshotQuery.mjs");assert.match(s,/departmentIds/);assert.match(s,/hasUnrestrictedDoc/);assert.match(s,/isTopicSnapshotAccessibleWithPrisma/);});

test("17-E trend view degrades gracefully below two snapshots and labels retired topics",()=>{const s=read("src/lib/topicSnapshotQuery.mjs");assert.match(s,/hasEnoughHistory/);assert.match(s,/retired:\s*latest\.topicId === null/);const modal=read("src/components/topics/TopicTrendModal.jsx");assert.match(modal,/Not enough history yet/);assert.match(modal,/Retired/);const list=read("src/app/(app)/org/[orgId]/topics/trend/page.jsx");assert.ok(list.length>0);});

test("17-E trend view is a modal (not a separate page), with a skeleton loader and no vocabulary-shift UI",()=>{const list=read("src/app/(app)/org/[orgId]/topics/trend/page.jsx");assert.match(list,/TopicTrendModal/);assert.doesNotMatch(list,/topics\/trend\/\$\{topic\.topicRef\}/);const modal=read("src/components/topics/TopicTrendModal.jsx");assert.match(modal,/ChartSkeleton/);assert.match(modal,/animate-pulse/);assert.doesNotMatch(modal,/vocabulary shift/i);assert.doesNotMatch(modal,/vocabularyDrift/);assert.ok(!fs.existsSync("src/app/(app)/org/[orgId]/topics/trend/[topicRef]/page.jsx"),"old detail page route should be removed");});

test("17-E trend view is reachable from the existing Expert Discovery surface",()=>{const experts=read("src/app/(app)/org/[orgId]/experts/page.jsx");assert.match(experts,/topics\/trend/);assert.match(experts,/Topic Evolution/);});

test("RBAC: trend API routes gate on resolveOrgRole before returning data",()=>{const list=read("src/app/api/org/[orgId]/topics/trend/route.js");assert.match(list,/resolveOrgRole/);assert.match(list,/getAccessibleTopicTrendsWithPrisma/);const detail=read("src/app/api/org/[orgId]/topics/trend/[topicRef]/route.js");assert.match(detail,/resolveOrgRole/);assert.match(detail,/getTopicTrendWithPrisma/);});

test("Interface Contract: capture job does not touch classification/lifecycle logic in worker/cluster.js",()=>{const s=read("scripts/task-17/capture-topic-snapshots.mjs");assert.doesNotMatch(s,/adjustTopicOnDocumentRemoval|classifyDocument|classifyRepositoryDocument/);});
