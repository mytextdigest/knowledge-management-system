// Read-only, dependency-free static acceptance checks. Does not connect to DB.
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];
function check(name,fn){try{const ok=fn();checks.push({name,status:ok?'PASS':'FAIL'});}catch(e){checks.push({name,status:'FAIL',detail:e.message});}}
const base='src/app/api/org/[orgId]';
check('C3 seed script exists',()=>read('scripts/ekp/p2/c3-default-category-termset.mjs').includes('DRY_RUN'));
check('C3 classifier dual-write integration',()=>read('worker/classify.js').includes('syncDocumentCategory'));
check('C4 taxonomy super_admin write guard',()=>read(`${base}/taxonomy/route.js`).includes('isSuperAdmin'));
check('C4 terms super_admin write guard',()=>read(`${base}/taxonomy/terms/route.js`).includes('isSuperAdmin'));
check('C4 fields super_admin write guard',()=>read(`${base}/taxonomy/fields/route.js`).includes('isSuperAdmin'));
check('C4 taxonomy audit write',()=>read(`${base}/taxonomy/route.js`).includes('auditLog.create'));
check('C4 terms audit write',()=>read(`${base}/taxonomy/terms/route.js`).includes('auditLog.create'));
check('C4 fields audit write',()=>read(`${base}/taxonomy/fields/route.js`).includes('auditLog.create'));
const tag=`${base}/documents/[documentId]/taxonomy/route.js`;
check('C5 access-scoped document lookup',()=>read(tag).includes('repositoryAccessWhere'));
check('C5 document edit guard',()=>read(tag).includes('Not permitted to tag this document'));
check('C5 audit write',()=>read(tag).includes('taxonomy.document_tags.updated'));
check('C5 accepted terms loaded',()=>read(tag).includes('status:"accepted"')||read(tag).includes('status: "accepted"'));
check('C5 UI persisted-tag display',()=>read('src/components/taxonomy/DocumentTaggingPanel.jsx').includes('Saved tags'));
for(const x of checks)console.log(`${x.status.padEnd(5)} ${x.name}${x.detail?' — '+x.detail:''}`);
console.log(`\n${checks.filter(x=>x.status==='PASS').length}/${checks.length} static checks passed.`);
console.log('NOTE: Static checks do not prove RBAC behavior, audit persistence, or runtime correctness.');
if(checks.some(x=>x.status==='FAIL'))process.exitCode=1;
