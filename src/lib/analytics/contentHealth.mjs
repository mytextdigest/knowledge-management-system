export function summarizeContentHealth(docs, {now=new Date(), requiredFields=['ownerId','category','summary']}={}) {
  const buckets={under30:0,days30to90:0,over90:0};
  const counts={total:docs.length,stale:0,owned:0,reviewCurrent:0,reviewDue:0,reviewOverdue:0,brokenLinks:0,duplicates:0,complete:0};
  const rows=[];
  for(const doc of docs) {
    const age=Math.max(0,(now-new Date(doc.contentUpdatedAt || doc.createdAt))/86400000);
    buckets[age<30?'under30':age<90?'days30to90':'over90']++;
    const overdue=doc.reviewRecords?.some(r=>r.status==='pending' && new Date(r.dueAt)<now) || (doc.nextReviewAt && new Date(doc.nextReviewAt)<now);
    const due=!overdue && doc.reviewRecords?.some(r=>r.status==='pending');
    const broken=(doc.links||[]).filter(l=>l.status==='broken').length;
    const duplicate=[...(doc.duplicatesAsDocument||[]),...(doc.duplicatesAsOriginal||[])].filter(d=>!['dismissed','resolved','rejected'].includes(d.status)).length;
    const missing=requiredFields.filter(f=>!doc[f] || typeof doc[f]==='string' && !doc[f].trim());
    const flags={stale:doc.lifecycleSuggestion==='archived',unowned:!doc.ownerId,reviewOverdue:!!overdue,reviewDue:!!due,broken:broken>0,duplicate:duplicate>0,incomplete:missing.length>0};
    if(flags.stale) counts.stale++;
    if(!flags.unowned) counts.owned++;
    if(flags.reviewOverdue) counts.reviewOverdue++; else if(flags.reviewDue) counts.reviewDue++; else counts.reviewCurrent++;
    counts.brokenLinks+=broken;counts.duplicates+=duplicate;
    if(!flags.incomplete) counts.complete++;
    rows.push({id:doc.id,filename:doc.filename||'Untitled',departmentId:doc.departmentId,sourceProvider:doc.sourceProvider||'manual',ageDays:Math.floor(age),brokenLinks:broken,missing,flags});
  }
  return {counts,buckets,documents:rows};
}
export function contentHealthCsv(rows) {
  const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return [['documentId','filename','departmentId','sourceProvider','ageDays','brokenLinks','missing','flags'],...rows.map(d=>[d.id,d.filename,d.departmentId,d.sourceProvider,d.ageDays,d.brokenLinks,d.missing.join(';'),Object.entries(d.flags).filter(([,v])=>v).map(([k])=>k).join(';')])].map(r=>r.map(cell).join(',')).join('\r\n');
}
