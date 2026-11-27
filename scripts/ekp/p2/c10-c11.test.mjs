import test from 'node:test';
import assert from 'node:assert/strict';
import { shortlistTerms, decideTags, similarity } from '../../../src/lib/taxonomy/autoTag.mjs';
import { matchingTerms, expandQueryWithTerms, ontologyBoosts, rerankTaggedRows } from '../../../src/lib/taxonomy/ontologySearch.mjs';
test('C10 shortlist bounded and cosine ranks relevant terms', () => {
  const terms = Array.from({length: 100}, (_, i) => ({id: String(i), embedding: i === 7 ? [1,0] : [0,1]}));
  const top = shortlistTerms(terms, [1,0]);
  assert.equal(top.length, 1); assert.equal(top[0].id, '7');
  assert.equal(similarity([1,0],[0,1]),0);
});
test('C10 invented term rejected, low confidence suggested, source tags force review', () => {
  const candidates = [{id:'t1',termSetId:'set'}], fields = [{id:'f1',termSetId:'set',multi:false}];
  assert.deepEqual(decideTags([{termId:'bad',confidence:1}],candidates,fields),[]);
  assert.equal(decideTags([{termId:'t1',confidence:.6}],candidates,fields)[0].status,'suggested');
  assert.equal(decideTags([{termId:'t1',confidence:.99}],candidates,fields,{sourceTagged:true})[0].status,'suggested');
});
test('C11 synonyms match phrase boundaries and narrower labels expand', () => {
  const terms = [
    {id:'a',label:'Safety Procedures',synonyms:[{label:'SOP Safety'}],ancestorIds:[]},
    {id:'b',label:'Turbine Inspection',synonyms:[],ancestorIds:['a']},
  ];
  assert.equal(matchingTerms('Find SOP safety docs',terms)[0].id,'a');
  assert.match(expandQueryWithTerms('SOP safety',terms).expanded,/Turbine Inspection/);
  assert.equal(matchingTerms('unsop safety',terms).length,0);
});
test('C11 only reranks already authorized candidates; suggested tags do not boost', () => {
  const terms=[{id:'a',label:'Safety',ancestorIds:[],relationsFrom:[],relationsTo:[]}];
  const weights=ontologyBoosts(terms,terms);
  const rows=[{id:'1',document_id:'d1',hybridScore:.5},{id:'2',document_id:'d2',hybridScore:.55}];
  const out=rerankTaggedRows(rows,[{documentId:'d1',termId:'a',status:'accepted'},{documentId:'private',termId:'a',status:'accepted'},{documentId:'d2',termId:'a',status:'suggested'}],weights);
  assert.equal(out[0].document_id,'d1'); assert.equal(out.length,2);
});
test('C11 nDCG@10 ranks relevant documents higher', async () => {
  const { ndcgAt10, evaluate } = await import('../search-eval/compare-ontology.mjs');
  assert.equal(ndcgAt10(['a'],['a']),1);
  assert.ok(ndcgAt10(['b','a'],['a']) < 1);
  assert.throws(() => evaluate([]), /20/);
});

test('C10 configurable threshold controls suggestion status', () => {
  const c = [{id:'t1',termSetId:'set'}], f = [{id:'f1',termSetId:'set',multi:false}];
  assert.equal(decideTags([{termId:'t1',confidence:.8}],c,f,{threshold:.85})[0].status,'suggested');
  assert.equal(decideTags([{termId:'t1',confidence:.8}],c,f,{threshold:.75})[0].status,'accepted');
});

test('CQ-3: any SharePoint source tag forces suggestions in every field',()=>{
  const fields=[{id:'f1',termSetId:'s1',key:'business',multi:true},{id:'f2',termSetId:'s2',key:'location',multi:true}];
  const candidates=[{id:'t1',termSetId:'s1'},{id:'t2',termSetId:'s2'}];
  const picks=[{termId:'t1',confidence:0.99},{termId:'t2',confidence:0.99}];
  assert.deepEqual(decideTags(picks,candidates,fields,{sourceTagged:true}).map(t=>t.status),['suggested','suggested']);
});

// Review fix: a document that gains a SharePoint tag keeps its earlier
// auto-accepted tags, as suggestions, instead of losing them.
test('C10 SharePoint tag demotes earlier auto tags to suggestions without deleting them', async () => {
  const { classifyTaxonomyTerms } = await import('../../../src/lib/taxonomy/autoTag.mjs');
  const stamp = new Date('2026-11-01T00:00:00Z');
  let rows = [
    { id: 'auto1', documentId: 'd1', fieldId: 'f1', termId: 't1', source: 'auto', status: 'accepted' },
    { id: 'sp1', documentId: 'd1', fieldId: 'f2', termId: 't9', source: 'source_system', status: 'accepted' },
    { id: 'old', documentId: 'd1', fieldId: 'f1', termId: 't3', source: 'auto', status: 'suggested' },
  ];
  const match = (r, w) => Object.entries(w).every(([k, v]) => {
    if (k === 'id' && v?.in) return v.in.includes(r.id);
    if (k === 'id' && v?.notIn) return !v.notIn.includes(r.id);
    if (k === 'fieldId' && v?.in) return v.in.includes(r.fieldId);
    return r[k] === v;
  });
  const tx = {
    $queryRaw: async () => [],
    documentTerm: {
      findMany: async ({ where }) => rows.filter((r) => match(r, where)),
      updateMany: async ({ where, data }) => { rows = rows.map((r) => (match(r, where) ? { ...r, ...data } : r)); },
      deleteMany: async ({ where }) => { rows = rows.filter((r) => !match(r, where)); },
      create: async ({ data }) => { rows.push({ id: `new-${data.termId}`, ...data }); },
    },
  };
  const prisma = {
    metadataField: { findMany: async () => [{ id: 'f1', key: 'topic', multi: true, termSetId: 's1' }] },
    term: { findMany: async () => ['t1', 't2', 't3'].map((id) => ({ id, label: id, termSetId: 's1', updatedAt: stamp, embeddedAt: stamp, synonyms: [] })) },
    $queryRaw: async () => [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    documentTerm: { count: async () => 1 },
    $transaction: async (fn) => fn(tx),
  };
  const openai = {
    embeddings: { create: async () => ({ data: [{ index: 0, embedding: Array(1536).fill(0.1) }] }) },
    chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify({ tags: [{ termId: 't1', confidence: 0.95 }, { termId: 't2', confidence: 0.9 }] }) } }] }) } },
  };
  await classifyTaxonomyTerms({ prisma, openai, orgId: 'o1', documentId: 'd1', filename: 'a.txt', summary: '', text: 'x' });
  const byTerm = Object.fromEntries(rows.map((r) => [r.termId, r]));
  assert.equal(byTerm.t1?.status, 'suggested', 'earlier auto tag kept, now a suggestion');
  assert.equal(byTerm.t1?.id, 'auto1', 'same row, not recreated');
  assert.equal(byTerm.t2?.status, 'suggested', 'new tag is a suggestion (CQ-3)');
  assert.equal(byTerm.t3, undefined, 'stale unreviewed suggestion replaced');
  assert.equal(byTerm.t9?.status, 'accepted', 'SharePoint tag untouched');
});
