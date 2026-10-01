import test from "node:test";
import assert from "node:assert/strict";
import {
  isTopicSnapshotAccessibleWithPrisma,
  getTopicTrendWithPrisma,
} from "../../src/lib/topicSnapshotQuery.mjs";

function fakePrisma({ snapshots = [], departmentMemberships = [] }) {
  return {
    topicSnapshot: {
      findMany: async ({ where, orderBy, take, select }) => {
        let rows = snapshots.filter((s) => s.topicRef === where.topicRef);
        if (orderBy?.periodStart === "asc") rows = [...rows].sort((a, b) => a.periodStart - b.periodStart);
        if (take) rows = rows.slice(0, take);
        return rows;
      },
    },
    departmentMember: {
      findFirst: async ({ where }) => {
        const ids = where.departmentId.in;
        return departmentMemberships.find((m) => m.userId === where.userId && ids.includes(m.departmentId)) || null;
      },
    },
  };
}

test("17-D: retired topic (topicId null) with a public-doc footprint is accessible to any org member", async () => {
  const prisma = fakePrisma({
    snapshots: [
      { topicRef: "t1", topicId: null, topicName: "Old Auth Flow", periodStart: 1, capturedAt: 1, documentCount: 3, expertCount: 1, keywordSummary: { auth: 1 }, departmentIds: [], hasUnrestrictedDoc: true },
    ],
  });
  const ok = await isTopicSnapshotAccessibleWithPrisma(prisma, { userId: "u1", isSuperAdmin: false, topicRef: "t1" });
  assert.equal(ok, true);
});

test("17-D: retired topic scoped only to a department the viewer never belonged to is denied", async () => {
  const prisma = fakePrisma({
    snapshots: [
      { topicRef: "t2", topicId: null, topicName: "Finance Only", periodStart: 1, capturedAt: 1, documentCount: 2, expertCount: 0, keywordSummary: null, departmentIds: ["dept-finance"], hasUnrestrictedDoc: false },
    ],
    departmentMemberships: [{ userId: "u1", departmentId: "dept-eng" }],
  });
  const ok = await isTopicSnapshotAccessibleWithPrisma(prisma, { userId: "u1", isSuperAdmin: false, topicRef: "t2" });
  assert.equal(ok, false);
});

test("17-D: department-scoped topic is accessible to a member of any department that ever contributed", async () => {
  const prisma = fakePrisma({
    snapshots: [
      { topicRef: "t3", topicId: "live-3", topicName: "HR Policy", periodStart: 1, capturedAt: 1, documentCount: 1, expertCount: 0, keywordSummary: null, departmentIds: ["dept-hr"], hasUnrestrictedDoc: false },
    ],
    departmentMemberships: [{ userId: "u1", departmentId: "dept-hr" }],
  });
  const ok = await isTopicSnapshotAccessibleWithPrisma(prisma, { userId: "u1", isSuperAdmin: false, topicRef: "t3" });
  assert.equal(ok, true);
});

test("17-D: a topicRef with no captured snapshot at all is never accessible, even to a real member", async () => {
  const prisma = fakePrisma({ snapshots: [] });
  const ok = await isTopicSnapshotAccessibleWithPrisma(prisma, { userId: "u1", isSuperAdmin: false, topicRef: "never-captured" });
  assert.equal(ok, false);
});

test("FR-3: fewer than two snapshots reports hasEnoughHistory=false without erroring", async () => {
  const prisma = fakePrisma({
    snapshots: [
      { topicRef: "t4", topicId: "live-4", topicName: "New Topic", periodStart: 1, capturedAt: 1, documentCount: 1, expertCount: 0, keywordSummary: { hello: 1 }, departmentIds: [], hasUnrestrictedDoc: true },
    ],
  });
  const trend = await getTopicTrendWithPrisma(prisma, { topicRef: "t4", userId: "u1", isSuperAdmin: true });
  assert.equal(trend.hasEnoughHistory, false);
  assert.equal(trend.snapshotCount, 1);
  assert.equal(trend.retired, false);
});

test("FR-3/FR-4: vocabulary drift diffs adjacent snapshots and a retired topic (topicId null) is labeled retired", async () => {
  const prisma = fakePrisma({
    snapshots: [
      { topicRef: "t5", topicId: null, topicName: "Legacy Deploys", periodStart: 1, capturedAt: 1, documentCount: 2, expertCount: 1, keywordSummary: { kubernetes: 1, rollback: 1 }, departmentIds: [], hasUnrestrictedDoc: true },
      { topicRef: "t5", topicId: null, topicName: "Legacy Deploys", periodStart: 2, capturedAt: 2, documentCount: 4, expertCount: 2, keywordSummary: { kubernetes: 1, canary: 1 }, departmentIds: [], hasUnrestrictedDoc: true },
    ],
  });
  const trend = await getTopicTrendWithPrisma(prisma, { topicRef: "t5", userId: "u1", isSuperAdmin: true });
  assert.equal(trend.hasEnoughHistory, true);
  assert.equal(trend.retired, true);
  const [first, second] = trend.series;
  assert.deepEqual(first.vocabularyDrift, { added: [], dropped: [] });
  assert.deepEqual(second.vocabularyDrift.added, ["canary"]);
  assert.deepEqual(second.vocabularyDrift.dropped, ["rollback"]);
  assert.equal(second.documentCount, 4);
  assert.equal(second.expertCount, 2);
});

test("FR-3: getTopicTrendWithPrisma returns null when the viewer is unauthorized", async () => {
  const prisma = fakePrisma({
    snapshots: [
      { topicRef: "t6", topicId: null, topicName: "Restricted", periodStart: 1, capturedAt: 1, documentCount: 1, expertCount: 0, keywordSummary: null, departmentIds: ["dept-x"], hasUnrestrictedDoc: false },
    ],
  });
  const trend = await getTopicTrendWithPrisma(prisma, { topicRef: "t6", userId: "outsider", isSuperAdmin: false });
  assert.equal(trend, null);
});
