import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSupersession } from '../../../src/lib/lifecycle/supersede.mjs';

const source = { id: 'a', orgId: 'org', scope: 'repository', departmentId: 'dept', lifecycle: 'published', supersededById: null };
const successor = { ...source, id: 'b' };
test('valid same-organization supersession', () => assert.equal(validateSupersession(source, successor), null));
test('blocks cross-org and cross-department supersession', () => {
  assert.match(validateSupersession(source, { ...successor, orgId: 'other' }), /organization/);
  assert.match(validateSupersession(source, { ...successor, departmentId: 'other' }), /department/);
});
test('blocks self, repeat, and invalid lifecycle', () => {
  assert.match(validateSupersession(source, source), /itself/);
  assert.match(validateSupersession({ ...source, supersededById: 'x' }, successor), /already/);
  assert.match(validateSupersession(source, { ...successor, lifecycle: 'draft' }), /published/);
});
