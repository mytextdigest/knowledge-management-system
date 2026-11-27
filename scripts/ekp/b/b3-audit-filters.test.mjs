import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAuditFilters, auditWhere } from '../../../src/lib/audit/filters.mjs';
test('filters enforce org scope and exact entity', () => {
  const f = parseAuditFilters(new URLSearchParams('action=document.published&entityType=document&entityId=d1&page=2&from=2026-10-01&to=2026-10-19'));
  const w = auditWhere('org1', f);
  assert.equal(w.orgId, 'org1'); assert.equal(w.entityId, 'd1'); assert.equal(w.action, 'document.published'); assert.equal(f.page, 2);
  assert.equal(w.createdAt.gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(w.createdAt.lte.toISOString(), '2026-10-19T23:59:59.999Z');
});
test('invalid date and reversed ranges fail closed', () => {
  assert.throws(() => parseAuditFilters(new URLSearchParams('from=2026-02-30')));
  assert.throws(() => auditWhere('org1', parseAuditFilters(new URLSearchParams('from=2026-10-19&to=2026-10-01'))));
});
test('unbounded page and untrusted filters are bounded', () => {
  assert.equal(parseAuditFilters(new URLSearchParams('page=-5')).page, 1);
  assert.equal(parseAuditFilters(new URLSearchParams('page=Infinity')).page, 1);
  assert.equal(parseAuditFilters(new URLSearchParams('action=' + 'x'.repeat(300))).action.length, 120);
});
