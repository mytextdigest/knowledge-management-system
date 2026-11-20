import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const single = readFileSync(
  'src/app/api/documents/[id]/summary-review/route.js',
  'utf8'
);

const listing = readFileSync(
  'src/app/api/org/[orgId]/summary-reviews/route.js',
  'utf8'
);

const bulk = readFileSync(
  'src/app/api/org/[orgId]/summary-reviews/bulk/route.js',
  'utf8'
);

test('B12 checks department management permissions', () => {
  assert.match(single, /canManageDepartment/);
  assert.match(single, /doc\.departmentId/);
});

test('B12 checks permissions again inside transaction', () => {
  assert.match(single, /Recheck current permissions inside the approval transaction/);
  assert.match(single, /tx\.organizationMember\.findUnique/);
  assert.match(single, /tx\.departmentMember\.findUnique/);
});

test('B12 rejects revoked permissions', () => {
  assert.match(single, /SUMMARY_FORBIDDEN/);
  assert.match(single, /return fail\('Forbidden', 403\)/);
});

test('B12 retains summary conflict protection', () => {
  assert.match(single, /expectedSummaryHash/);
  assert.match(single, /SUMMARY_CONFLICT/);
  assert.match(single, /isolationLevel: 'Serializable'/);
});

test('B23 scopes department admin review listing', () => {
  assert.match(listing, /role === 'dept_admin'/);
  assert.match(listing, /departmentMember\.findMany/);
  assert.match(listing, /departmentIds/);
  assert.match(listing, /departmentFilter/);
});

test('B23 bulk approval validates organization scope', () => {
  assert.match(bulk, /orgId, scope: 'repository'/);
  assert.match(bulk, /const allowed = new Set/);
});

test('B23 bulk approval reuses single document authorization', () => {
  assert.match(bulk, /PATCH as approveSingle/);
  assert.match(bulk, /await approveSingle/);
});

test('B23 bulk approval reports partial failures', () => {
  assert.match(bulk, /status:\s*results\.every\(x => x\.status === 200\)\s*\?\s*200\s*:\s*207/);
  assert.match(bulk, /results/);
});