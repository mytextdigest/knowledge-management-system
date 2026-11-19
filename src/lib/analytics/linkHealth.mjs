import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function extractDocumentUrls(content = '') {
  const matches = String(content).match(/https?:\/\/[^\s<>"'`]+/gi) || [];
  return [...new Set(matches.map(x => x.replace(/[),.;!?\]]+$/g, '')).filter(x => {
    try { const u = new URL(x); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
  }))].slice(0, 200);
}
export const urlHash = url => createHash('sha256').update(url).digest('hex');
function publicAddress(address) {
  if (isIP(address) === 4) {
    const a = address.split('.').map(Number);
    return !(a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 ||
      (a[0] === 169 && a[1] === 254) || (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
      (a[0] === 192 && a[1] === 168) || (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
      (a[0] === 192 && a[1] === 0) || (a[0] === 198 && (a[1] === 18 || a[1] === 19)));
  }
  if (isIP(address) === 6) {
    const x = address.toLowerCase();
    return !(x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') ||
      x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') ||
      x.startsWith('::ffff:') || x.startsWith('2001:db8:'));
  }
  return false;
}
export async function isSafePublicUrl(raw, resolver = lookup) {
  try {
    const u = new URL(raw);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port && !['80','443'].includes(u.port)) return false;
    if (u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname.endsWith('.local') || u.hostname.endsWith('.internal')) return false;
    const records = isIP(u.hostname) ? [{address:u.hostname}] : await resolver(u.hostname, {all:true});
    return records.length > 0 && records.every(r => publicAddress(r.address));
  } catch { return false; }
}
export async function checkLink(url, { fetcher = fetch, safe = isSafePublicUrl } = {}) {
  if (!await safe(url)) return {status:'unknown', httpStatus:null};
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetcher(url, {method, redirect:'manual', signal:AbortSignal.timeout(10000), headers:{'User-Agent':'KMS-LinkHealth/1.0'}});
      // Redirects are deliberately not followed (redirect target could be internal).
      if (response.status >= 300 && response.status < 400) return {status:'unknown', httpStatus:response.status};
      if (method === 'HEAD' && [403,405,501].includes(response.status)) continue;
      return {status:response.status === 404 || response.status === 410 ? 'broken' : response.ok ? 'ok' : 'unknown', httpStatus:response.status};
    } catch { if (method === 'GET') return {status:'unknown',httpStatus:null}; }
  }
  return {status:'unknown',httpStatus:null};
}
export async function scanDocumentLinks(prisma, {orgId, maxDocuments=100, check=checkLink, now=new Date()} = {}) {
  if (!orgId) throw new Error('orgId required');
  const docs = await prisma.document.findMany({where:{orgId,deletedAt:null},select:{id:true,content:true,externalUrl:true,sourceProvider:true},take:Math.min(maxDocuments,500),orderBy:{id:'asc'}});
  let scanned=0,broken=0,unknown=0;
  const hostLast = new Map();
  for (const doc of docs) {
    const urls = extractDocumentUrls(doc.content);
    if (doc.externalUrl && ['sharepoint','servicenow'].includes(doc.sourceProvider)) urls.push(doc.externalUrl);
    for (const url of [...new Set(urls)].slice(0,200)) {
      const hash=urlHash(url);
      const old=await prisma.documentLink.findUnique({where:{documentId_urlHash:{documentId:doc.id,urlHash:hash}}});
      const host=new URL(url).hostname;
      const wait=Math.max(0,(hostLast.get(host)||0)+250-Date.now());
      if (wait) await new Promise(resolve=>setTimeout(resolve,wait));
      hostLast.set(host,Date.now());
      const result=await check(url);
      const firstBrokenAt=result.status==='broken' ? old?.firstBrokenAt || now : null;
      await prisma.documentLink.upsert({where:{documentId_urlHash:{documentId:doc.id,urlHash:hash}},create:{documentId:doc.id,url,urlHash,...result,checkedAt:now,firstBrokenAt},update:{url,...result,checkedAt:now,firstBrokenAt}});
      scanned++; if(result.status==='broken') broken++; if(result.status==='unknown') unknown++;
    }
  }
  return {documents:docs.length,links:scanned,broken,unknown,partial:docs.length===Math.min(maxDocuments,500)};
}
