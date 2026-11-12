import { verifyImportApply } from './applyGuard.mjs';
import { buildApplyPlan, calculateHierarchy, normalizeImportedSynonyms } from './applyPlan.mjs';
import { normalizeLabel } from '../labels.mjs';
import { planSafeSynonymUpserts } from './synonymSafety.mjs';
import { parseTaxonomyCsv } from './csv.mjs';
import { parseSkosTurtle, parseSkosRdfXml } from './skos.mjs';
const parsers = { csv:parseTaxonomyCsv, skos_ttl:parseSkosTurtle, skos_rdfxml:parseSkosRdfXml };
/** Called ONLY inside a locked Prisma transaction, after org authorization. */
export async function applyImportedTaxonomy(tx,{orgId,termSetId,format,content,confirmationToken,actorUserId}) {
  // The lock serializes imports for this set. All import writers must use this function.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`taxonomy-import:${termSetId}`}))::text AS locked`;
  const set = await tx.termSet.findFirst({where:{id:termSetId,orgId},select:{id:true,source:true,readOnly:true}});
  if (!set) throw new Error('Term set not found');
  if (set.source !== 'external' || !set.readOnly) throw new Error('Only external read-only sets may be imported');
  const terms = await tx.term.findMany({where:{termSetId},select:{id:true,externalId:true,parentId:true,label:true,description:true,status:true,synonyms:{select:{normalizedLabel:true,kind:true}}}});
  const verified = verifyImportApply({termSetId,format,content,terms,confirmationToken});
  const parsed = parsers[format](content);
  const ordered = buildApplyPlan(parsed.concepts);
  // Add all new IDs before wiring any hierarchy, including parents introduced in this import.
  const existing = new Map(terms.map(t=>[t.externalId,t.id]));
  const additions = ordered.filter(c=>!existing.has(c.externalId));
  if (additions.length) await tx.term.createMany({data:additions.map(c=>({termSetId,externalId:c.externalId,label:c.label,normalizedLabel:normalizeLabel(c.label),description:c.description??null,status:'active',parentId:null,ancestorIds:[],depth:0}))});
  const all = await tx.term.findMany({where:{termSetId},select:{id:true,externalId:true}});
  const ids = new Map(all.map(t=>[t.externalId,t.id]));
  const hierarchy = calculateHierarchy(ordered,ids);
  for (const c of ordered) {
    const termId = ids.get(c.externalId), node=hierarchy.get(c.externalId);
    await tx.term.update({where:{id:termId},data:{label:c.label,normalizedLabel:normalizeLabel(c.label),description:c.description??null,status:'active',parentId:node.parentId,ancestorIds:node.ancestorIds,depth:node.depth}});
    const synonyms=normalizeImportedSynonyms(c);
    const stored = await tx.termSynonym.findMany({where:{termId},select:{normalizedLabel:true,kind:true}});
    const { additions: missing } = planSafeSynonymUpserts(stored,synonyms);
    if (missing.length) await tx.termSynonym.createMany({data:missing.map(s=>({...s,termId}))});
  }
  const importedIds = new Set(ordered.map(c=>c.externalId));
  const deprecatedIds = terms.filter(t=>!importedIds.has(t.externalId) && t.status!=='deprecated').map(t=>t.id);
  if (deprecatedIds.length) await tx.term.updateMany({where:{id:{in:deprecatedIds},termSetId},data:{status:'deprecated'}});
  // DocumentTerm is intentionally never deleted or rewritten on re-import.
  await tx.termSet.update({where:{id:termSetId},data:{lastImportedAt:new Date(),importFormat:format}});
  const record=await tx.taxonomyImport.create({data:{orgId,termSetId,format,status:'applied',summary:verified.summary,createdById:actorUserId,appliedAt:new Date()}});
  await tx.auditLog.create({data:{orgId,actorUserId,action:'taxonomy.external_import.applied',entityType:'TermSet',entityId:termSetId,after:{importId:record.id,format,summary:verified.summary}}});
  return {importId:record.id,summary:verified.summary};
}
