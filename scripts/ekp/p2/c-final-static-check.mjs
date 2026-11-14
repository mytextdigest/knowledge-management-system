// Read-only, dependency-free static acceptance checks for C-M1. Does not connect to the DB.
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
function check(name, fn) {
  try { checks.push({ name, status: fn() ? 'PASS' : 'FAIL' }); }
  catch (e) { checks.push({ name, status: 'FAIL', detail: e.message }); }
}
const base = 'src/app/api/org/[orgId]';
const tag = `${base}/documents/[documentId]/taxonomy/route.js`;
check('C3 seed script is dry-run by default', () => read('scripts/ekp/p2/c3-default-category-termset.mjs').includes('DRY_RUN'));
check('C3 classifier dual-write, guarded', () => /try \{\s*await syncDocumentCategory/.test(read('worker/classify.js')));
check('C3 reviewer correction becomes a manual Category tag', () => read('src/app/api/documents/[id]/classification/route.js').includes('source: "manual"'));
check('C3 classifier never overrides a manual tag', () => read('src/lib/taxonomy/defaultCategory.mjs').includes("'manual_override'"));
for (const [label, file] of [['term sets', `${base}/taxonomy/route.js`], ['terms', `${base}/taxonomy/terms/route.js`], ['merge', `${base}/taxonomy/terms/merge/route.js`], ['fields', `${base}/taxonomy/fields/route.js`]]) {
  check(`C4 ${label}: super_admin write guard`, () => read(file).includes('isSuperAdmin'));
  check(`C4 ${label}: audited with logAudit`, () => read(file).includes('logAudit('));
}
check('C4 synonyms are written', () => read(`${base}/taxonomy/terms/route.js`).includes('termSynonym.createMany'));
check('C4 merge re-points tags and deprecates the source', () => { const s = read(`${base}/taxonomy/terms/merge/route.js`); return s.includes('mergedIntoId: target.id') && s.includes('documentTerm.updateMany'); });
check('C4 one label normalisation', () => read(`${base}/taxonomy/terms/route.js`).includes('normalizeLabel') && read('src/lib/taxonomy/defaultCategory.mjs').includes("from './labels.mjs'"));
check('C4 page uses the app layout', () => read('src/app/(app)/org/[orgId]/taxonomy/page.jsx').includes('<Layout>'));
check('C4 page is in the sidebar', () => read('src/components/layout/AppSidebar.jsx').includes('/taxonomy`'));
check('C5 access-scoped document lookup', () => read(tag).includes('repositoryAccessWhere'));
check('C5 edit permission is canManageDocument', () => read(tag).includes('canManageDocument(a.document'));
check('C5 audit write', () => read(tag).includes('taxonomy.document_tags.updated'));
check('C5 SharePoint tags are never replaced', () => read(tag).includes('TAXONOMY_SOURCE_CONFLICT'));
for (const x of checks) console.log(`${x.status.padEnd(5)} ${x.name}${x.detail ? ' — ' + x.detail : ''}`);
console.log(`\n${checks.filter((x) => x.status === 'PASS').length}/${checks.length} static checks passed.`);
console.log('NOTE: Static checks do not prove RBAC behavior, audit persistence, or runtime correctness.');
if (checks.some((x) => x.status === 'FAIL')) process.exitCode = 1;
