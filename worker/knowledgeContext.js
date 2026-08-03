import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const RELATED_THRESHOLD = 0.72;
const TOPIC_THRESHOLD = 0.70;

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot=0, na=0, nb=0;
  for (let i=0;i<a.length;i++){ dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return na && nb ? dot / Math.sqrt(na*nb) : 0;
}
function average(vectors) {
  const valid=vectors.filter(v=>Array.isArray(v)&&v.length);
  if(!valid.length) return null;
  const out=Array(valid[0].length).fill(0);
  for(const v of valid) for(let i=0;i<out.length;i++) out[i]+=Number(v[i]||0);
  return out.map(x=>x/valid.length);
}
function keywords(text) {
  const stop=new Set(['the','and','for','with','that','this','from','are','was','were','into','about','have','has','will','your','our']);
  const counts=new Map();
  for(const w of String(text||'').toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)||[]) if(!stop.has(w)) counts.set(w,(counts.get(w)||0)+1);
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([w])=>w);
}
function relationshipType(content, otherName) {
  const text=String(content||'').toLowerCase();
  const name=String(otherName||'').replace(/\.[^.]+$/,'').toLowerCase();
  if(name.length>5 && text.includes(name)) return 'references';
  if(/supersedes|replaces|obsolete|new version/.test(text)) return 'supersedes';
  return 'related';
}

export async function processKnowledgeContext(docId) {
  const doc=await prisma.document.findUnique({where:{id:docId},include:{chunks:{select:{embedding:true}},project:true}});
  if(!doc?.orgId || doc.scope!=='repository') return {skipped:true};
  const embedding=average(doc.chunks.map(c=>c.embedding));
  if(!embedding) return {skipped:true,reason:'no_embedding'};

  const others=await prisma.document.findMany({
    where:{orgId:doc.orgId,scope:'repository',lifecycle:'published',id:{not:doc.id}},
    include:{chunks:{select:{embedding:true}}},take:1000,
  });
  for(const other of others){
    const sim=cosine(embedding,average(other.chunks.map(c=>c.embedding)));
    if(sim<RELATED_THRESHOLD) continue;
    const [fromDocumentId,toDocumentId]=[doc.id,other.id].sort();
    await prisma.documentRelationship.upsert({
      where:{fromDocumentId_toDocumentId_type:{fromDocumentId,toDocumentId,type:relationshipType(doc.content,other.filename)}},
      create:{orgId:doc.orgId,fromDocumentId,toDocumentId,type:relationshipType(doc.content,other.filename),weight:sim,evidence:{embeddingSimilarity:sim}},
      update:{weight:sim,evidence:{embeddingSimilarity:sim}},
    });
  }

  const topicName=(keywords(`${doc.filename} ${doc.summary||''} ${doc.content||''}`)[0]||'General Knowledge').replace(/(^.|\s.)/g,m=>m.toUpperCase());
  const topics=await prisma.topic.findMany({where:{orgId:doc.orgId,scope:'repository'}});
  let topic=topics.map(t=>({t,sim:cosine(embedding,t.centroidEmbedding)})).sort((a,b)=>b.sim-a.sim)[0];
  if(!topic || topic.sim<TOPIC_THRESHOLD){
    topic={t:await prisma.topic.create({data:{orgId:doc.orgId,scope:'repository',name:topicName,centroidEmbedding:embedding,keywordDistribution:keywords(doc.content),documentCount:0}}),sim:1};
  }
  await prisma.topicDocument.upsert({where:{documentId:doc.id},create:{documentId:doc.id,topicId:topic.t.id,confidence:topic.sim},update:{topicId:topic.t.id,confidence:topic.sim}});
  const count=await prisma.topicDocument.count({where:{topicId:topic.t.id}});
  await prisma.topic.update({where:{id:topic.t.id},data:{documentCount:count}});

  const auditCount=await prisma.chatAuditLog.count({where:{orgId:doc.orgId,citedDocIds:{has:doc.id}}});
  await prisma.topicExpertise.upsert({
    where:{topicId_userId:{topicId:topic.t.id,userId:doc.userId}},
    create:{topicId:topic.t.id,userId:doc.userId,score:1+Math.min(2,auditCount*.1),signals:{uploaded:1,citations:auditCount}},
    update:{score:1+Math.min(2,auditCount*.1),signals:{uploaded:1,citations:auditCount}},
  });

  const projects=await prisma.project.findMany({where:{orgId:doc.orgId},select:{id:true,name:true}});
  const haystack=`${doc.filename} ${doc.summary||''} ${doc.content||''}`.toLowerCase();
  for(const project of projects){
    const name=project.name.toLowerCase();
    if(name.length<3 || !haystack.includes(name)) continue;
    await prisma.documentProjectLink.upsert({
      where:{documentId_projectId:{documentId:doc.id,projectId:project.id}},
      create:{documentId:doc.id,projectId:project.id,confidence:0.92,evidence:`Project name “${project.name}” appears in the document.`},
      update:{confidence:0.92,evidence:`Project name “${project.name}” appears in the document.`,status:'suggested'},
    });
  }
  return {topicId:topic.t.id};
}
