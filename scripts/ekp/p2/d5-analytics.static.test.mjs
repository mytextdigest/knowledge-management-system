import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
test('analytics endpoint requires authenticated admin and scopes department admins', () => {
  const source = read('src/app/api/org/[orgId]/analytics/route.js');
  assert.match(source, /getServerSession/);
  assert.match(source, /resolveOrgRole/);
  assert.match(source, /\['super_admin', 'dept_admin'\]/);
  assert.match(source, /departmentMember\.findMany/);
  assert.match(source, /permittedDepartments\.includes\(requestedDepartment\)/);
  assert.match(source, /departmentId: \{ in: permittedDepartments \}/);
  assert.match(source, /'Cache-Control': 'no-store'/);
});
test('analytics aggregates search events and click counts without loading unbounded history', () => {
  const source = read('src/app/api/org/[orgId]/analytics/route.js');
  assert.match(source, /searchEvent\.groupBy/);
  assert.match(source, /searchEvent\.count/);
  assert.match(source, /searchClick\.count/);
  assert.match(source, /take: 30/);
});
test('dashboard renders search activity, no-results and the governance tab', () => {
  const source = read('src/app/(app)/org/[orgId]/analytics/page.jsx');
  assert.match(source, /No-result queries/);
  assert.match(source, /Recent search activity/);
  assert.match(source, /AnalyticsTabs/);
  assert.match(read('src/components/analytics/AnalyticsTabs.jsx'), /governance-metrics/);
});
