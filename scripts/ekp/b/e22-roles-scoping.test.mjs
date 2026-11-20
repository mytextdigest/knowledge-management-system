// E22.2 role-based approvers (any/all) and E22.3 department/category scoping: pure rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDefinition, definitionCovers, specificity, settleStage } from '../../../src/lib/workflows/engine.mjs';
import { validateWorkflowDraft } from '../../../src/lib/workflows/uiValidation.mjs';

test('role stages need no named approver; named stages still do', () => {
  assert.equal(validateDefinition({ name: 'A', stages: [{ name: 'R', approverType: 'dept_admin', approvalMode: 'all' }] }), null);
  assert.equal(validateDefinition({ name: 'A', stages: [{ name: 'R', approverType: 'owner' }] }), null);
  assert.match(validateDefinition({ name: 'A', stages: [{ name: 'R', approverType: 'user' }] }), /stage/);
  assert.match(validateDefinition({ name: 'A', stages: [{ name: 'R', approverType: 'manager' }] }), /approver type/);
  assert.match(validateDefinition({ name: 'A', stages: [{ name: 'R', approverType: 'owner', approverUserId: 'u1' }] }), /named-person/);
  assert.match(validateDefinition({ name: 'A', stages: [{ name: 'R', approverType: 'dept_admin', approvalMode: 'most' }] }), /mode/);
  assert.match(validateDefinition({ name: 'A', departmentIds: [''], stages: [{ name: 'R', approverUserId: 'u' }] }), /departmentIds/);
  assert.equal(validateWorkflowDraft('A', [{ name: 'R', approverType: 'dept_admin', approverUserId: '' }]), null);
  assert.match(validateWorkflowDraft('A', [{ name: 'R', approverType: 'user', approverUserId: '' }]), /reviewer/);
});

test('coverage: empty lists cover everything; both lists must match', () => {
  const doc = { departmentId: 'eng', category: 'SOPs' };
  assert.ok(definitionCovers({ departmentIds: [], categories: [] }, doc));
  assert.ok(definitionCovers({ departmentIds: ['eng'], categories: [] }, doc));
  assert.ok(!definitionCovers({ departmentIds: ['fin'], categories: [] }, doc));
  assert.ok(definitionCovers({ departmentIds: ['eng'], categories: ['SOPs'] }, doc));
  assert.ok(!definitionCovers({ departmentIds: ['eng'], categories: ['Policies'] }, doc));
  assert.ok(!definitionCovers({ departmentIds: ['eng'], categories: [] }, { departmentId: null, category: null }));
});

test('specificity: department+category > department > category > org-wide', () => {
  const s = (departmentIds, categories) => specificity({ departmentIds, categories });
  assert.ok(s(['d'], ['c']) > s(['d'], []));
  assert.ok(s(['d'], []) > s([], ['c']));
  assert.ok(s([], ['c']) > s([], []));
});

test('settling a multi-approver stage', () => {
  assert.deepEqual(settleStage({ mode: 'all', action: 'approve', otherPending: 1 }), { waiting: true, cancelOthers: false });
  assert.deepEqual(settleStage({ mode: 'all', action: 'approve', otherPending: 0 }), { waiting: false, cancelOthers: false });
  assert.deepEqual(settleStage({ mode: 'all', action: 'reject', otherPending: 2 }), { waiting: false, cancelOthers: true });
  assert.deepEqual(settleStage({ mode: 'any', action: 'approve', otherPending: 2 }), { waiting: false, cancelOthers: true });
  assert.deepEqual(settleStage({ mode: 'any', action: 'request_changes', otherPending: 0 }), { waiting: false, cancelOthers: false });
});
