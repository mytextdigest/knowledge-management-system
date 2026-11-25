import test from 'node:test';import assert from 'node:assert/strict';
import {extractDocumentUrls,urlHash,checkLink,isSafePublicUrl} from '../../../src/lib/analytics/linkHealth.mjs';
import {summarizeContentHealth} from '../../../src/lib/analytics/contentHealth.mjs';
import {evaluate} from '../search-eval/run.mjs';
test('URL extraction deduplicates and strips punctuation',()=>assert.deepEqual(extractDocumentUrls('https://example.com/a, https://example.com/a'),['https://example.com/a']));
test('hash stable',()=>assert.equal(urlHash('x'),urlHash('x')));
test('private addresses rejected',async()=>{for(const u of ['http://127.0.0.1','http://10.0.0.1','http://[::1]','http://localhost'])assert.equal(await isSafePublicUrl(u),false)});
test('404 broken; 405 HEAD falls back GET',async()=>{const methods=[];const result=await checkLink('https://example.com',{safe:async()=>true,fetcher:async(_u,o)=>{methods.push(o.method);return {status:o.method==='HEAD'?405:404,ok:false}}});assert.deepEqual(methods,['HEAD','GET']);assert.equal(result.status,'broken')});
test('metrics and flags',()=>{const r=summarizeContentHealth([{id:'1',createdAt:'2026-01-01',filename:'a',links:[{status:'broken'}],lifecycleSuggestion:'archived',reviewRecords:[],duplicates:[]}],{now:new Date('2026-11-20')});assert.equal(r.counts.stale,1);assert.equal(r.counts.brokenLinks,1);assert.equal(r.counts.owned,0)});
test('D13 nDCG baseline vs ontology uses stable fixture keys',()=>{const r=evaluate([{id:'a',query:'grid',relevant:['m3-001'],baseline:['m3-002','m3-001'],ontology:['m3-001','m3-002']}]);assert.equal(r.count,1);assert.ok(r.ontologyNdcg10>r.baselineNdcg10)});

test('age alone does not override Workstream B stale flag',()=>{const r=summarizeContentHealth([{id:'old',createdAt:'2025-01-01',reviewRecords:[],links:[]},{id:'flagged',createdAt:'2026-11-19',lifecycleSuggestion:'archived',reviewRecords:[],links:[]}],{now:new Date('2026-11-20')});assert.equal(r.counts.stale,1);assert.equal(r.documents[0].flags.stale,false);assert.equal(r.documents[1].flags.stale,true)});
test('redirect chain is checked and a final 404 is broken',async()=>{
 const requested=[];
 const response=await checkLink('https://example.com/start',{safe:async url=>url.startsWith('https://example.com/'),fetcher:async url=>{
   requested.push(url);
   return url.endsWith('/start') ? {status:301,headers:{get:()=>'/missing'}} : {status:404,ok:false};
 }});
 assert.equal(response.status,'broken');assert.deepEqual(requested,['https://example.com/start','https://example.com/missing']);
});
test('redirect to unsafe host is not requested',async()=>{
 const requested=[];
 const response=await checkLink('https://example.com/start',{safe:async url=>!url.includes('127.0.0.1'),fetcher:async url=>{
   requested.push(url);return {status:302,headers:{get:()=> 'http://127.0.0.1/admin'}};
 }});
 assert.equal(response.status,'unknown');assert.equal(requested.length,1);
});
test('CSV escapes spreadsheet formulas',async()=>{
 const {contentHealthCsv}=await import('../../../src/lib/analytics/contentHealth.mjs');
 const csv=contentHealthCsv([{id:'1',filename:'=1+1',departmentId:'',sourceProvider:'manual',ageDays:1,brokenLinks:0,missing:[],flags:{}}]);
 assert.ok(csv.includes("'=1+1"));
});

// D-13 fixture integrity: the shared C-M3/D-M3 corpus must keep testing what
// the ontology adds, so no synonym may leak into a document.
test('D13 fixture: 20-30 queries, known documents, synonyms absent from text, planted links', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('./fixtures/m3-corpus/', import.meta.url);
  const read = (f) => readFileSync(new URL(f, dir), 'utf8');
  const manifest = JSON.parse(read('manifest.json'));
  const { queries } = JSON.parse(read('queries.json'));
  const keys = new Set(manifest.documents.map((d) => d.externalId));
  assert.ok(queries.length >= 20 && queries.length <= 30);
  assert.equal(new Set(queries.map((q) => q.query.toLowerCase())).size, queries.length, 'no duplicate queries');
  for (const q of queries) for (const id of q.relevant) assert.ok(keys.has(id), `${q.id}: unknown ${id}`);
  const files = readdirSync(dir).filter((f) => /^m3-\d{3}\.txt$/.test(f));
  assert.equal(files.length, manifest.documents.length);
  const corpus = files.map(read).join(' ').toLowerCase();
  for (const [, alt] of read('terms.ttl').matchAll(/altLabel "([^"]+)"/g)) {
    for (const word of alt.toLowerCase().match(/[a-z0-9]+/g)) if (word.length > 2) assert.ok(!corpus.includes(word), `synonym "${alt}" leaks into the corpus`);
  }
  assert.ok(corpus.includes('https://example.com/m3-fixture-not-found-2026'), 'dead link planted');
  assert.ok(manifest.documents.some((d) => d.review === 'overdue') && manifest.documents.some((d) => d.review === 'due'));
  assert.ok(new Set(manifest.documents.map((d) => d.department)).size >= 2, 'two departments for dept-admin scoping');
});
