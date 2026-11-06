import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const allowed = [
  'src/app/(app)/org/[orgId]/repository/page.jsx',
  'src/app/(app)/org/[orgId]/taxonomy/',
  'src/app/api/org/[orgId]/documents/[documentId]/taxonomy/route.js',
  'src/app/api/org/[orgId]/taxonomy/',
  'src/components/repository/RepositoryDocumentCard.jsx',
  'src/components/taxonomy/',
  'src/lib/taxonomy/',
  'scripts/ekp/p2/',
  'worker/classify.js',
];
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
let failures = 0;
function test(label, fn) {
  try { fn(); console.log('PASS', label); }
  catch (error) { failures++; console.error('FAIL', label, '-', error.message); }
}
const route = 'src/app/api/org/[orgId]/documents/[documentId]/taxonomy/route.js';
const required = [
  'src/app/(app)/org/[orgId]/taxonomy/page.jsx',
  'src/app/api/org/[orgId]/taxonomy/route.js',
  'src/app/api/org/[orgId]/taxonomy/fields/route.js',
  'src/app/api/org/[orgId]/taxonomy/terms/route.js',
  'src/components/taxonomy/DocumentTaggingPanel.jsx',
  'src/lib/taxonomy/defaultCategory.mjs',
  'scripts/ekp/p2/c3-default-category-termset.mjs',
  route,
];
test('Expected feature branch', () => { if (run('git', ['branch','--show-current']) !== 'feature/ekp-ws-c') throw Error('Wrong branch'); });
test('Required C feature files exist', () => { const missing = required.filter(p => !fs.existsSync(p)); if (missing.length) throw Error(missing.join(', ')); });
test('C5 single-value conflict guard is present', () => {
  const s = fs.readFileSync(route, 'utf8');
  for (const marker of ['TAXONOMY_SINGLE_VALUE_CONFLICT', 'source:{not:"manual"}', 'status:"accepted"', ',409)', 'auditLog.create', 'repositoryAccessWhere']) {
    if (!s.includes(marker)) throw Error(`Missing marker: ${marker}`);
  }
});
test('C3 script is opt-in for writes', () => {
  const s = fs.readFileSync('scripts/ekp/p2/c3-default-category-termset.mjs','utf8');
  if (!s.includes('--apply') || !s.includes('DRY_RUN')) throw Error('Dry-run / apply markers missing');
});
test('No unrelated paths are staged', () => {
  const staged = run('git', ['diff','--cached','--name-only']).split(/\r?\n/).filter(Boolean);
  const bad = staged.filter(p => !allowed.some(a => a.endsWith('/') ? p.startsWith(a) : p === a));
  if (bad.length) throw Error(`Unexpected staged paths:\n${bad.join('\n')}`);
  console.log(`  ${staged.length} staged C paths; ${staged.length ? 'review them before commit' : 'nothing staged yet'}`);
});
test('No staged whitespace errors', () => { run('git', ['diff','--cached','--check']); });
test('No unstaged whitespace errors', () => { run('git', ['diff','--check']); });
console.log(`\n${failures ? `FAILED: ${failures} preflight checks` : 'PASS: all 7 local preflight checks'}`);
console.log('NOT PROVEN: authenticated RBAC, database audit persistence, approved C3 backfill, design approval, GitHub PR.');
if (failures) process.exitCode = 1;
