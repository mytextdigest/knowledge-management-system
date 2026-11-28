export async function scanSearchGaps(db,{orgId,now=new Date()}) {
  const groups=new Map(); let cursor;
  for(;;){
    const rows=await db.searchEvent.findMany({where:{orgId,createdAt:{gte:new Date(+now-30*86400000)},OR:[{resultCount:0},{kind:'chat',confidence:'low'}]},orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,normalizedQuery:true,resultCount:true,confidence:true,createdAt:true}});
    if(!rows.length)break;
    for(const e of rows){const topic=e.normalizedQuery.trim();if(!topic)continue;const g=groups.get(topic)||{orgId,topic,occurrenceCount:0,zeroCitationCount:0,lowConfidenceCount:0,events:[]};g.occurrenceCount++;g.zeroCitationCount+=Number(e.resultCount===0);g.lowConfidenceCount+=Number(e.confidence==='low');g.events.push(e);g.events.sort((a,b)=>+new Date(b.createdAt)-+new Date(a.createdAt));g.events.length=Math.min(50,g.events.length);groups.set(topic,g);}
    cursor=rows.at(-1).id;
  }
  const data=[...groups.values()].map(({events,...g})=>({...g,gapScore:g.occurrenceCount*2+g.zeroCitationCount*3+g.lowConfidenceCount,queryIds:events.map(e=>e.id)}));
  await db.$transaction(async tx=>{await tx.knowledgeGap.deleteMany({where:{orgId,NOT:{queryIds:{isEmpty:true}}}});if(data.length)await tx.knowledgeGap.createMany({data});});
  return {gaps:data.length};
}
