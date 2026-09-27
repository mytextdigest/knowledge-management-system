import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accessSql } from "@/lib/knowledgeContext";

export const GRAPH_DEFAULT_DEPTH = 2;
export const GRAPH_NODE_LIMIT = 75;
export const GRAPH_EDGE_LIMIT = 150;
const nodeId = (type, id) => `${type}:${id}`;
const addNode = (map, type, id, label, meta = {}) => id && map.set(nodeId(type,id), { id: nodeId(type,id), entityId: id, type, label: label || type, ...meta });
const addEdge = (edges, sourceType, sourceId, targetType, targetId, type, provenance, evidence = null, weight = null) => {
  if (!sourceId || !targetId) return;
  edges.push({ source: nodeId(sourceType,sourceId), target: nodeId(targetType,targetId), type, provenance, evidence, weight });
};

async function accessibleDocumentIds({ orgId, userId, isSuperAdmin }) {
  const access = accessSql({ userId, isSuperAdmin, alias: "d" });
  const rows = await prisma.$queryRaw`SELECT d.id FROM "Document" d WHERE d."orgId" = ${orgId} AND ${access}`;
  return rows.map((r) => r.id);
}

export async function searchKnowledgeGraphNodes({ orgId, userId, isSuperAdmin = false, query = "", limit = 20 }) {
  const ids = await accessibleDocumentIds({ orgId, userId, isSuperAdmin });
  if (!ids.length) return [];
  const q = String(query).trim().toLowerCase();
  const docs = await prisma.document.findMany({ where: { id: { in: ids }, ...(q ? { filename: { contains: q, mode: "insensitive" } } : {}) }, select: { id:true, filename:true }, take: limit });
  const topics = await prisma.topic.findMany({ where: { topicDocuments: { some: { documentId: { in: ids } } }, ...(q ? { name: { contains:q, mode:"insensitive" } } : {}) }, select:{id:true,name:true}, take:limit });
  const entities = await prisma.entity.findMany({ where: { documentId:{in:ids}, ...(q ? { name:{contains:q,mode:"insensitive"} }:{}) }, select:{id:true,name:true,type:true}, take:limit });
  return [
    ...docs.map(d=>({id:nodeId("document",d.id),entityId:d.id,type:"document",label:d.filename||"Document"})),
    ...topics.map(t=>({id:nodeId("topic",t.id),entityId:t.id,type:"topic",label:t.name})),
    ...entities.map(e=>({id:nodeId("entity",e.id),entityId:e.id,type:"entity",label:e.name,entityType:e.type})),
  ].slice(0,limit);
}

export async function getKnowledgeGraph({ orgId, userId, isSuperAdmin = false, startNode, depth = GRAPH_DEFAULT_DEPTH, filters = {} }) {
  const allowedIds = await accessibleDocumentIds({ orgId, userId, isSuperAdmin });
  const allowed = new Set(allowedIds);
  if (!allowedIds.length) return { nodes: [], edges: [], truncated:false };
  const docs = await prisma.document.findMany({
    where:{
      id:{in:allowedIds},
      ...(filters.departmentId ? { OR: [
        { departmentId: filters.departmentId },
        { project: { departmentId: filters.departmentId } },
      ] } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
    },
    select:{id:true,filename:true,departmentId:true,projectId:true, project:{select:{id:true,name:true,departmentId:true}}, department:{select:{id:true,name:true}}, topicDocument:{select:{topic:{select:{id:true,name:true}}}}, entities:{select:{id:true,name:true,type:true}}, decisions:{select:{id:true,statement:true}}, lessons:{where:{status:"published"},select:{id:true,topic:true,whatHappened:true,projectId:true,decisionId:true}}, projectLinks:{select:{projectId:true,status:true,project:{select:{id:true,name:true,departmentId:true}}}}}
  });
  const scopedDocIds = docs.map((d) => d.id);
  const scopedAllowed = new Set(scopedDocIds);
  const nodes=new Map(), edges=[];
  for (const d of docs) {
    addNode(nodes,"document",d.id,d.filename,{departmentId:d.departmentId,projectId:d.projectId});
    if(d.department){addNode(nodes,"department",d.department.id,d.department.name);addEdge(edges,"document",d.id,"department",d.department.id,"belongs_to_department","explicit");}
    if(d.project){addNode(nodes,"project",d.project.id,d.project.name,{departmentId:d.project.departmentId});addEdge(edges,"document",d.id,"project",d.project.id,"belongs_to_project","explicit");}
    for(const link of d.projectLinks){if(link.status==="suggested"&&!filters.includeSuggested)continue;addNode(nodes,"project",link.project.id,link.project.name,{departmentId:link.project.departmentId});addEdge(edges,"document",d.id,"project",link.projectId,"linked_to_project",link.status==="suggested"?"suggested":"explicit",{status:link.status});}
    const topic=d.topicDocument?.topic;if(topic){addNode(nodes,"topic",topic.id,topic.name);addEdge(edges,"document",d.id,"topic",topic.id,"has_topic","explicit");}
    for(const e of d.entities){addNode(nodes,"entity",e.id,e.name,{entityType:e.type});addEdge(edges,"document",d.id,"entity",e.id,"mentions","explicit");}
    for(const dec of d.decisions){addNode(nodes,"decision",dec.id,dec.statement);addEdge(edges,"document",d.id,"decision",dec.id,"contains_decision","explicit");}
    for(const lesson of d.lessons){addNode(nodes,"lesson",lesson.id,lesson.topic||lesson.whatHappened?.slice(0,80)||"Lesson");addEdge(edges,"document",d.id,"lesson",lesson.id,"contains_lesson","explicit");if(lesson.decisionId)addEdge(edges,"lesson",lesson.id,"decision",lesson.decisionId,"learned_from_decision","explicit");if(lesson.projectId)addEdge(edges,"lesson",lesson.id,"project",lesson.projectId,"lesson_for_project","explicit");}
  }
  const relationships=await prisma.documentRelationship.findMany({where:{orgId,fromDocumentId:{in:scopedDocIds},toDocumentId:{in:scopedDocIds}},take:GRAPH_EDGE_LIMIT});
  for(const r of relationships)addEdge(edges,"document",r.fromDocumentId,"document",r.toDocumentId,r.type,"inferred",r.evidence,r.weight);
  const conflicts=await prisma.documentConflict.findMany({where:{documentAId:{in:scopedDocIds},documentBId:{in:scopedDocIds},status:{not:"dismissed"}},take:GRAPH_EDGE_LIMIT});
  for(const c of conflicts)addEdge(edges,"document",c.documentAId,"document",c.documentBId,"conflict","conflict",{summary:c.summary,status:c.status});
  const timeline=await prisma.timelineEvent.findMany({where:{OR:[{documentId:{in:scopedDocIds}},{project:{documents:{some:{id:{in:scopedDocIds}}}}}]},take:GRAPH_EDGE_LIMIT});
  for(const t of timeline){if(t.documentId&&!scopedAllowed.has(t.documentId))continue;if(t.documentId&&t.projectId)addEdge(edges,"document",t.documentId,"project",t.projectId,"timeline_context","explicit",{timelineEventId:t.id,description:t.description,occurredAt:t.occurredAt});if(t.documentId&&t.departmentId)addEdge(edges,"document",t.documentId,"department",t.departmentId,"timeline_context","explicit",{timelineEventId:t.id});if(t.documentId&&t.decisionId)addEdge(edges,"document",t.documentId,"decision",t.decisionId,"timeline_context","explicit",{timelineEventId:t.id});}
  const expertise=await prisma.topicExpertise.findMany({where:{topic:{topicDocuments:{some:{documentId:{in:scopedDocIds}}}},source:{not:"dismissed"}},include:{user:{select:{id:true,name:true,email:true}},topic:{select:{id:true,name:true}}},take:GRAPH_EDGE_LIMIT});
  for(const x of expertise){addNode(nodes,"expert",x.user.id,x.user.name||x.user.email,{score:x.score});addNode(nodes,"topic",x.topic.id,x.topic.name);addEdge(edges,"expert",x.user.id,"topic",x.topic.id,"expert_in",x.source==="inferred"?"inferred":"explicit",x.signals,x.score);}
  // Never emit dangling edges: this also prevents indirect labels/associations to inaccessible documents.
  let edgeList=edges.filter(e=>nodes.has(e.source)&&nodes.has(e.target));
  const [startType,startId]=String(startNode||"").split(":");
  const start=nodeId(startType,startId);
  if(startNode&&!nodes.has(start)) return {nodes:[],edges:[],truncated:false};
  if(startNode){const reached=new Set([start]);let frontier=new Set([start]);for(let hop=0;hop<Math.max(1,Math.min(2,Number(depth)||1));hop++){const next=new Set();for(const e of edgeList){if(frontier.has(e.source)&&!reached.has(e.target))next.add(e.target);if(frontier.has(e.target)&&!reached.has(e.source))next.add(e.source);}for(const id of next)reached.add(id);frontier=next;}edgeList=edgeList.filter(e=>reached.has(e.source)&&reached.has(e.target));for(const id of [...nodes.keys()])if(!reached.has(id))nodes.delete(id);}
  if(filters.nodeType) for(const [id,n] of nodes) if(n.type!==filters.nodeType&&id!==start) nodes.delete(id);
  if(filters.relationshipType) edgeList=edgeList.filter(e=>e.type===filters.relationshipType);
  edgeList=edgeList.filter(e=>nodes.has(e.source)&&nodes.has(e.target));
  const nodeList=[...nodes.values()].slice(0,GRAPH_NODE_LIMIT);const kept=new Set(nodeList.map(n=>n.id));edgeList=edgeList.filter(e=>kept.has(e.source)&&kept.has(e.target)).slice(0,GRAPH_EDGE_LIMIT);
  return {nodes:nodeList,edges:edgeList,truncated:nodes.size>GRAPH_NODE_LIMIT||edges.length>GRAPH_EDGE_LIMIT};
}

export async function getKnowledgeGraphSourceVersion({ orgId, userId, isSuperAdmin = false }) {
  const ids = await accessibleDocumentIds({ orgId, userId, isSuperAdmin });
  if (!ids.length) return "empty";
  const [latestDocument, latestRelationship, latestTopic] = await Promise.all([
    prisma.document.findFirst({ where: { id: { in: ids } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, id: true } }),
    prisma.documentRelationship.findFirst({ where: { orgId, fromDocumentId: { in: ids }, toDocumentId: { in: ids } }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true, id: true } }),
    prisma.topic.findFirst({ where: { topicDocuments: { some: { documentId: { in: ids } } } }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true, id: true } }),
  ]);
  return [
    latestDocument ? `${latestDocument.id}:${latestDocument.createdAt.toISOString()}` : "no-doc",
    latestRelationship ? `${latestRelationship.id}:${latestRelationship.updatedAt.toISOString()}` : "no-rel",
    latestTopic ? `${latestTopic.id}:${latestTopic.updatedAt.toISOString()}` : "no-topic",
  ].join("|");
}
