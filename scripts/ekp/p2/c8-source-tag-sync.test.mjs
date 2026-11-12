import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSourceDocumentTerms } from '../../../src/lib/taxonomy/import/sourceTagSync.mjs';

function fixture({tags=[{fieldName:'Dept',label:'Finance',termGuid:'g1'}],existing=[],multi=true,terms=[{id:'t1',parentId:null,label:'Finance',status:'active',termStoreGuid:'g1'}],externalId='set-guid'}={}) {
  const calls=[];
  const tx={
    document:{findFirst:async()=>({id:'d'})},
    documentSourceTag:{findMany:async()=>tags},
    metadataField:{findMany:async()=>[{id:'f',termSetId:'set',multi}]},
    termSet:{findFirst:async()=>({id:'set',externalId})},
    term:{findMany:async()=>terms},
    documentTerm:{findMany:async()=>existing,deleteMany:async a=>calls.push(['delete',a]),create:async a=>calls.push(['create',a])}
  };
  return {tx,calls};
}
test('maps source GUID and writes accepted source_system classification',async()=>{
  const {tx,calls}=fixture(); const r=await reconcileSourceDocumentTerms(tx,{orgId:'o',documentId:'d',fieldBySourceName:{Dept:'f'}});
  assert.equal(r.fields[0].status,'synced');assert.equal(calls.length,1);assert.equal(calls[0][1].data.source,'source_system');
});
test('preserves manual assignment and avoids duplicate',async()=>{
  const {tx,calls}=fixture({existing:[{id:'dt',termId:'t1',source:'manual'}]});
  await reconcileSourceDocumentTerms(tx,{orgId:'o',documentId:'d',fieldBySourceName:{Dept:'f'}});assert.equal(calls.length,0);
});
test('does not delete source assignments when tags are unresolved',async()=>{
  const {tx,calls}=fixture({tags:[{fieldName:'Dept',label:'Unknown',termGuid:'other'}],existing:[{id:'dt',termId:'t1',source:'source_system'}]});
  const r=await reconcileSourceDocumentTerms(tx,{orgId:'o',documentId:'d',fieldBySourceName:{Dept:'f'}});
  assert.equal(r.fields[0].status,'review');assert.equal(calls.length,0);
});
test('only deletes stale source_system assignments for a fully resolved field',async()=>{
  const {tx,calls}=fixture({existing:[{id:'old',termId:'t2',source:'source_system'},{id:'manual',termId:'t3',source:'manual'}]});
  await reconcileSourceDocumentTerms(tx,{orgId:'o',documentId:'d',fieldBySourceName:{Dept:'f'}});
  assert.equal(calls[0][0],'delete');assert.deepEqual(calls[0][1].where.id.in,['old']);assert.equal(calls[1][0],'create');
});
test('single-value field refuses multiple mapped tags',async()=>{
  const {tx,calls}=fixture({multi:false,tags:[{fieldName:'Dept',label:'Finance',termGuid:'g1'},{fieldName:'Dept',label:'HR',termGuid:'g2'}],terms:[{id:'t1',label:'Finance',status:'active',termStoreGuid:'g1'},{id:'t2',label:'HR',status:'active',termStoreGuid:'g2'}]});
  const r=await reconcileSourceDocumentTerms(tx,{orgId:'o',documentId:'d',fieldBySourceName:{Dept:'f'}});
  assert.equal(r.fields[0].status,'review');assert.equal(calls.length,0);
});
