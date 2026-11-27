import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurgePlan, isEligibleForPurge } from '../../../src/lib/lifecycle/purgePolicy.mjs';
const now = new Date('2026-10-20T00:00:00Z');
const base = { id: 'd1', orgId: 'org1', deletedAt: '2026-09-01T00:00:00Z', purgeAfter: '2026-10-01T00:00:00Z', filePath: 'a', versions: [{ filePath: 'a' }, { filePath: 'b' }], _count: { chunks: 3, versions: 2 } };
test('expired retention is eligible', () => assert.equal(isEligibleForPurge(base, now), true));
test('rejects missing org, invalid deadline and future deadline', () => {
  assert.equal(isEligibleForPurge({ ...base, orgId: null }, now), false);
  assert.equal(isEligibleForPurge({ ...base, purgeAfter: 'invalid' }, now), false);
  assert.equal(isEligibleForPurge({ ...base, purgeAfter: '2026-12-01' }, now), false);
});
test('preserves unique version objects in plan', () => {
  const plan = createPurgePlan(base, now);
  assert.deepEqual(plan.objectKeys, ['a', 'b']);
  assert.equal(plan.chunkCount, 3);
  assert.equal(plan.blocked, false);
});
test('blocks referenced documents and open review workflows', () => {
  const plan = createPurgePlan({ ...base, supersedes: [{ id: 'x' }], workflowInstances: [{ status: 'in_review' }], reviewRecords: [{ status: 'pending' }] }, now);
  assert.equal(plan.blocked, true);
  assert.deepEqual(plan.blockers, ['referenced_as_successor', 'open_workflow', 'pending_review']);
});
