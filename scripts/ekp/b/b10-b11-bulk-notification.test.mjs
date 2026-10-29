import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../../src/app/api/org/[orgId]/ownership/bulk-reassign/route.js', import.meta.url), 'utf8');
test('bulk ownership change requires source and target org membership', () => {
  assert.match(source, /sourceMember = await tx\.organizationMember\.findUnique/);
  assert.match(source, /if \(!sourceMember\) throw new Error\('INVALID_SOURCE'\)/);
  assert.match(source, /if \(!member\) throw new Error\('INVALID_TARGET'\)/);
});
test('bulk ownership notification occurs only after transaction commit', () => {
  const transactionEnd = source.indexOf('}, { isolationLevel:');
  const notifyCall = source.indexOf('await notify({');
  assert.ok(transactionEnd >= 0 && notifyCall > transactionEnd);
  assert.match(source, /if \(result\.reassigned > 0\)/);
});
test('bulk update keeps concurrency checks and scoped audit', () => {
  assert.match(source, /isolationLevel: 'Serializable'/);
  assert.match(source, /DOCUMENT_OWNER_CHANGED/);
  assert.match(source, /where: \{ id: doc\.id, \.\.\.where \}/);
});
