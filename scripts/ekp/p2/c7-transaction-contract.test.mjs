import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportedTaxonomy } from '../../../src/lib/taxonomy/import/applyDb.mjs';
import { prepareImportApply } from '../../../src/lib/taxonomy/import/applyGuard.mjs';

function mockDb(initial = []) {
  const rows = structuredClone(initial);
  const synonyms = new Map();
  const calls = [];
  const tx = {
    $queryRaw: async () => { calls.push('advisory-lock'); return [{locked:'ok'}]; },
    termSet: {
      findFirst: async () => ({id:'set1',source:'external',readOnly:true}),
      update: async ({data}) => { calls.push('set-update'); assert.ok(data.lastImportedAt); },
    },
    term: {
      findMany: async ({select}) => rows.map(t => ({...t, ...(select.synonyms ? {synonyms:synonyms.get(t.id)||[]} : {})})),
      createMany: async ({data}) => { calls.push('create-terms'); for (const item of data) rows.push({id:`db${rows.length+1}`,...item}); },
      update: async ({where,data}) => { calls.push('update-term'); const row=rows.find(r=>r.id===where.id); assert.ok(row); Object.assign(row,data); },
      updateMany: async ({where,data}) => { calls.push('deprecate'); for(const row of rows) if(where.id.in.includes(row.id)) Object.assign(row,data); },
    },
    termSynonym: {
      findMany: async ({where}) => synonyms.get(where.termId)||[],
      createMany: async ({data}) => { calls.push('add-synonyms'); for(const s of data) synonyms.set(s.termId,[...(synonyms.get(s.termId)||[]),s]); },
      deleteMany: async () => { throw Error('Importer must never delete synonyms'); },
    },
    documentTerm: { deleteMany: async () => { throw Error('Importer must never delete classifications'); } },
    taxonomyImport: { create: async ({data}) => { calls.push('import-audit'); return {id:'import1',...data}; } },
    auditLog: { create: async () => { calls.push('audit'); } },
  };
  return {tx,rows,synonyms,calls};
}
const csv=(records)=>['externalId,label,parentExternalId,altLabels',...records].join('\n');
async function apply(db,content) {
  const terms=await db.tx.term.findMany({select:{synonyms:true}});
  const {confirmationToken}=prepareImportApply({termSetId:'set1',format:'csv',content,terms});
  return applyImportedTaxonomy(db.tx,{orgId:'org1',termSetId:'set1',format:'csv',content,confirmationToken,actorUserId:'user1'});
}

test('transaction contract: creates hierarchy, preserves IDs on rename and move, deprecates without deletion', async()=>{
  const db=mockDb();
  const first=csv(['a,Alpha,,','b,Beta,a,Alias','c,Gamma,,']);
  await apply(db,first);
  assert.equal(db.rows.length,3);
  const ids=Object.fromEntries(db.rows.map(t=>[t.externalId,t.id]));
  assert.equal(db.rows.find(t=>t.externalId==='b').parentId,ids.a);
  assert.equal(db.synonyms.get(ids.b)?.[0].normalizedLabel,'alias');
  const second=csv(['a,Alpha,,','b,New Beta,c,Alias','c,Gamma,,']);
  await apply(db,second);
  assert.equal(db.rows.find(t=>t.externalId==='b').id,ids.b);
  assert.equal(db.rows.find(t=>t.externalId==='b').parentId,ids.c);
  assert.equal(db.synonyms.get(ids.b).length,1);
  await apply(db,csv(['a,Alpha,,','b,New Beta,a,Alias']));
  assert.equal(db.rows.find(t=>t.externalId==='c').status,'deprecated');
  assert.ok(db.calls.indexOf('advisory-lock') < db.calls.indexOf('create-terms'));
  assert.ok(db.calls.includes('audit'));
});

test('transaction contract: rejects stale preview before writing terms', async()=>{
  const db=mockDb();
  const content=csv(['a,Alpha,,']);
  const {confirmationToken}=prepareImportApply({termSetId:'set1',format:'csv',content,terms:[]});
  db.rows.push({id:'db0',externalId:'other',label:'Other',parentId:null,description:null,status:'active'});
  await assert.rejects(applyImportedTaxonomy(db.tx,{orgId:'org1',termSetId:'set1',format:'csv',content,confirmationToken,actorUserId:'user1'}),/stale/i);
  assert.equal(db.calls.includes('create-terms'),false);
  assert.equal(db.calls.includes('update-term'),false);
});
