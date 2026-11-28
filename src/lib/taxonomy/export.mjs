const uri = id => `<urn:kms:term:${encodeURIComponent(id)}>`;
const literal = s => JSON.stringify(String(s)).replace(/\u007f/g,"\\u007F");
const csv = s => '"'+String(s??'').replace(/^[\s]*[=+@-]/,m=>"'"+m).replaceAll('"','""')+'"';
export function exportTaxonomy(set,format){
 if(!['csv','ttl'].includes(format))throw new Error('Invalid export format');
 const terms=set.terms; const ids=new Set(terms.map(t=>t.id));
 if(format==='csv')return [['externalId','label','parentExternalId','description','synonyms','hiddenLabels','status','originalExternalId'],...terms.map(t=>[t.id,t.label,t.parentId,t.description,t.synonyms.filter(s=>s.kind==='alt').map(s=>s.label).join('|'),t.synonyms.filter(s=>s.kind==='hidden').map(s=>s.label).join('|'),t.status,t.externalId])].map(r=>r.map(csv).join(',')).join('\r\n');
 const scheme=`<urn:kms:termset:${encodeURIComponent(set.id)}>`;
 return ['@prefix skos: <http://www.w3.org/2004/02/skos/core#> .','@prefix owl: <http://www.w3.org/2002/07/owl#> .',`${scheme} a skos:ConceptScheme ; skos:prefLabel ${literal(set.name)} .`,...terms.map(t=>[`${uri(t.id)} a skos:Concept`, `skos:inScheme ${scheme}`,`skos:prefLabel ${literal(t.label)}`,...(t.parentId&&ids.has(t.parentId)?[`skos:broader ${uri(t.parentId)}`]:[]),...(t.description?[`skos:definition ${literal(t.description)}`]:[]),...t.synonyms.map(s=>`skos:${s.kind==='hidden'?'hiddenLabel':'altLabel'} ${literal(s.label)}`),...(t.relationsFrom||[]).filter(r=>ids.has(r.toTermId)).map(r=>`skos:related ${uri(r.toTermId)}`),...(t.status==='deprecated'?['owl:deprecated true']:[])].join(' ;\n  ')+' .')].join('\n');
}
