export class InvalidFacetSelection extends Error {}
// Facet counts use the caller's existing access-filtered document predicate.
export async function facetSelection(db, orgId, selections = {}) {
  if (!selections || typeof selections !== "object" || Array.isArray(selections) || Object.values(selections).some(v=>typeof v!=="string" || !v)) throw new InvalidFacetSelection("Invalid facet selection");
  const fields = await db.metadataField.findMany({where:{orgId,facet:true},orderBy:[{facetOrder:'asc'},{name:'asc'}],include:{termSet:{include:{terms:{select:{id:true,label:true,parentId:true,ancestorIds:true,status:true}}}}}});
  const filters = [];
  for (const [fieldId, termId] of Object.entries(selections)) {
    const field = fields.find(f=>f.id===fieldId);
    if (!field || !field.termSet.terms.some(t=>t.id===termId && t.status==='active')) throw new InvalidFacetSelection('Invalid facet selection');
    filters.push({terms:{some:{fieldId,status:'accepted',term:{termSetId:field.termSetId,OR:[{id:termId},{ancestorIds:{has:termId}}]}}}});
  }
  return {fields,filters};
}
export function buildBuckets(terms, tags) {
  const active = terms.filter(t=>t.status==='active');
  const byId = new Map(terms.map(t=>[t.id,t]));
  const counts = new Map(active.map(t=>[t.id,new Set()]));
  for(const tag of tags){const t=byId.get(tag.termId); if(!t)continue; for(const id of [t.id,...t.ancestorIds]) counts.get(id)?.add(tag.documentId);}
  const nodes = new Map(active.map(t=>[t.id,{termId:t.id,label:t.label,count:counts.get(t.id).size,children:[]}]));
  const roots=[];
  for(const t of active){const node=nodes.get(t.id); if(!node.count)continue; const parent=nodes.get(t.parentId); if(parent?.count)parent.children.push(node);else roots.push(node);}
  return roots;
}
export async function countFacets(db, fields, where) {
  return Promise.all(fields.map(async f=>({fieldId:f.id,label:f.name,buckets:buildBuckets(f.termSet.terms,await db.documentTerm.findMany({where:{fieldId:f.id,status:'accepted',document:where,term:{termSetId:f.termSetId}},select:{termId:true,documentId:true}}))})));
}

export async function corpusFacets(db, fields, corpus, filters) {
  const eligibleDocumentIds = [];
  const tagsByField = new Map(fields.map(f=>[f.id,[]]));
  for (let offset=0;offset<corpus.length;offset+=5000) {
    const ids=corpus.slice(offset,offset+5000);
    const where={AND:[{id:{in:ids},deletedAt:null},...filters]};
    const eligible=filters.length ? (await db.document.findMany({where,select:{id:true}})).map(d=>d.id) : ids;
    eligibleDocumentIds.push(...eligible);
    await Promise.all(fields.map(async f=>{
      const tags=await db.documentTerm.findMany({where:{fieldId:f.id,status:'accepted',document:where,term:{termSetId:f.termSetId}},select:{termId:true,documentId:true}});
      tagsByField.get(f.id).push(...tags);
    }));
  }
  return {eligibleDocumentIds,facets:fields.map(f=>({fieldId:f.id,label:f.name,buckets:buildBuckets(f.termSet.terms,tagsByField.get(f.id))}))};
}
