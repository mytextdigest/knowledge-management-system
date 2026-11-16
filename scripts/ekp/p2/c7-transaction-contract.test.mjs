// C-6/C-7 apply contract against an in-memory transaction: first import
// creates a read-only set, re-import keeps ids, tags and synonyms, and the
// number of writes doesn't grow with the taxonomy (2,600 terms, 8 levels).
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { applyImportedTaxonomy, importTargetKey } from '../../../src/lib/taxonomy/import/applyDb.mjs';
import { prepareImportApply } from '../../../src/lib/taxonomy/import/applyGuard.mjs';

function mockDb() {
  const state = { set: null, terms: [], synonyms: [], relations: [] };
  const calls = [];
  const call = (name) => calls.push(name);
  const tx = {
    $queryRaw: async () => { call('advisory-lock'); return [{ locked: 'ok' }]; },
    termSet: {
      findFirst: async () => state.set,
      create: async ({ data }) => { call('create-set'); state.set = { id: 'set1', ...data }; return { id: 'set1' }; },
      update: async ({ data }) => { call('set-update'); assert.ok(data.lastImportedAt); Object.assign(state.set, data); },
    },
    term: {
      findMany: async () => state.terms.map((t) => ({ ...t, synonyms: state.synonyms.filter((s) => s.termId === t.id) })),
      createMany: async ({ data }) => {
        call('create-terms');
        const seen = new Set(state.terms.map((t) => t.id));
        for (const t of data) { if (t.parentId) assert.ok(seen.has(t.parentId), 'parents are inserted first'); seen.add(t.id); state.terms.push({ ...t }); }
      },
      update: async ({ where, data }) => { call('update-term'); Object.assign(state.terms.find((t) => t.id === where.id), data); },
      updateMany: async ({ where, data }) => { call('deprecate'); for (const t of state.terms) if (where.id.in.includes(t.id)) Object.assign(t, data); },
    },
    termSynonym: {
      createMany: async ({ data }) => { call('add-synonyms'); state.synonyms.push(...data); },
      deleteMany: async () => { throw new Error('Importer must never delete synonyms'); },
    },
    termRelation: {
      deleteMany: async () => { call('clear-relations'); state.relations = []; },
      createMany: async ({ data }) => { call('add-relations'); state.relations.push(...data); },
    },
    documentTerm: { deleteMany: async () => { throw new Error('Importer must never delete tags'); } },
    taxonomyImport: { create: async ({ data }) => { call('import-record'); return { id: 'import1', ...data }; } },
  };
  return { tx, state, calls };
}

async function apply(db, content, { format = 'csv', newSetName = null } = {}) {
  const termSetId = db.state.set?.id ?? null;
  const terms = termSetId ? await db.tx.term.findMany() : [];
  const key = importTargetKey({ termSetId, newSetName });
  const { confirmationToken } = prepareImportApply({ termSetId: key, format, content, terms });
  db.calls.length = 0;
  return applyImportedTaxonomy(db.tx, { orgId: 'org1', termSetId, newSetName, format, content, confirmationToken, actorUserId: 'user1' });
}
const csv = (rows) => ['externalId,label,parentExternalId,altLabels', ...rows].join('\n');

test('first import creates a read-only external set; re-import keeps ids, moves and deprecates', async () => {
  const db = mockDb();
  const first = await apply(db, csv(['a,Alpha,,', 'b,Beta,a,Alias', 'c,Gamma,,']), { newSetName: 'Enterprise' });
  assert.equal(first.created, true);
  assert.equal(db.state.set.source, 'external');
  assert.equal(db.state.set.readOnly, true);
  assert.equal(db.state.terms.length, 3);
  const ids = Object.fromEntries(db.state.terms.map((t) => [t.externalId, t.id]));
  assert.equal(db.state.terms.find((t) => t.externalId === 'b').parentId, ids.a);
  assert.deepEqual(db.state.terms.find((t) => t.externalId === 'b').ancestorIds, [ids.a]);
  assert.equal(db.state.synonyms[0].normalizedLabel, 'alias');

  await apply(db, csv(['a,Alpha,,', 'b,New Beta,c,Alias', 'c,Gamma,,']));
  const b = db.state.terms.find((t) => t.externalId === 'b');
  assert.equal(b.id, ids.b);
  assert.equal(b.parentId, ids.c);
  assert.equal(b.label, 'New Beta');
  assert.equal(db.state.synonyms.length, 1);
  assert.deepEqual(db.calls.filter((c) => c === 'update-term'), ['update-term'], 'only the changed term is written');

  await apply(db, csv(['a,Alpha,,', 'b,New Beta,a,Alias']));
  assert.equal(db.state.terms.find((t) => t.externalId === 'c').status, 'deprecated');
  assert.equal(db.calls[0], 'advisory-lock');
});

test('a stale preview is refused before anything is written', async () => {
  const db = mockDb();
  await apply(db, csv(['a,Alpha,,']), { newSetName: 'Enterprise' });
  const content = csv(['a,Alpha,,', 'b,Beta,,']);
  const { confirmationToken } = prepareImportApply({ termSetId: 'set1', format: 'csv', content, terms: await db.tx.term.findMany() });
  db.state.terms[0].label = 'Changed elsewhere';
  db.calls.length = 0;
  await assert.rejects(applyImportedTaxonomy(db.tx, { orgId: 'org1', termSetId: 'set1', format: 'csv', content, confirmationToken, actorUserId: 'user1' }), /stale/i);
  assert.deepEqual(db.calls, ['advisory-lock']);
});

test('SKOS: related links, term-store GUIDs in concept URIs, scheme kept on the set', async () => {
  const db = mockDb();
  const ttl = `@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<urn:scheme> a skos:ConceptScheme ; skos:prefLabel "Enterprise"@en .
<https://t.example/term/1e117ab2-e3ba-4b8b-9d9b-ca51b94b517d> a skos:Concept ; skos:prefLabel "Product Development"@en ; skos:related <urn:b> .
<urn:b> a skos:Concept ; skos:prefLabel "Engineering"@en .`;
  await apply(db, ttl, { format: 'skos_ttl', newSetName: 'Enterprise' });
  const pd = db.state.terms.find((t) => t.label === 'Product Development');
  assert.equal(pd.termStoreGuid, '1e117ab2-e3ba-4b8b-9d9b-ca51b94b517d');
  assert.equal(db.state.relations.length, 1);
  assert.equal(db.state.set.externalId, 'urn:scheme');
});

test('scale: 2,600-term, 8-level SKOS file imports with a fixed number of writes', async () => {
  const lines = ['@prefix skos: <http://www.w3.org/2004/02/skos/core#> .', '@prefix ex: <https://taxonomy.example/c/> .'];
  for (let i = 0; i < 2600; i++) {
    const level = i % 8;
    lines.push(`ex:t${i} a skos:Concept ; skos:prefLabel "Term ${i}"@en ; skos:altLabel "Alias ${i}"@en${level ? ` ; skos:broader ex:t${i - 1}` : ''} .`);
  }
  const ttl = lines.join('\n');
  const db = mockDb();
  const start = performance.now();
  const result = await apply(db, ttl, { format: 'skos_ttl', newSetName: 'Big' });
  const elapsed = performance.now() - start;
  assert.equal(result.writes.added, 2600);
  assert.equal(Math.max(...db.state.terms.map((t) => t.depth)), 7);
  assert.equal(db.calls.filter((c) => c === 'create-terms').length, 1);
  assert.equal(db.calls.filter((c) => c === 'update-term').length, 0);
  assert.ok(db.calls.length < 12, `writes: ${db.calls.join(', ')}`);
  assert.ok(elapsed < 60_000);
  console.log(`C-6 scale: 2,600 SKOS terms parsed, planned and applied (in memory) in ${elapsed.toFixed(0)} ms with ${db.calls.length} database calls`);

  // An unchanged re-import writes no terms.
  await apply(db, ttl, { format: 'skos_ttl' });
  assert.equal(db.calls.filter((c) => c === 'update-term' || c === 'create-terms').length, 0);
});
