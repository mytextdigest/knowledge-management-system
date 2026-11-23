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
// Each redirect is validated independently to prevent SSRF through Location headers.
export async function checkLink(url, { fetcher = fetch, safe = isSafePublicUrl, timeoutMs = 4000 } = {}) {
  if (!await safe(url)) return { status: 'unknown', httpStatus: null };
  for (const method of ['HEAD', 'GET']) {
    let current = url;
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!await safe(current)) return { status: 'unknown', httpStatus: null };
      let response;
      try {
        response = await fetcher(current, { method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'KMS-LinkHealth/1.0' } });
      } catch { break; }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.get('location');
        if (!location || redirects === 5) return { status: 'unknown', httpStatus: response.status };
        try { current = new URL(location, current).toString(); } catch { return { status: 'unknown', httpStatus: response.status }; }
        continue;
      }
      if (method === 'HEAD' && [403, 405, 501].includes(response.status)) break;
      return { status: [404, 410].includes(response.status) ? 'broken' : response.ok ? 'ok' : 'unknown', httpStatus: response.status };
    }
  }
  return { status: 'unknown', httpStatus: null };
}
const externalSource = doc => ['sharepoint', 'servicenow'].includes(String(doc.sourceProvider || '').toLowerCase());
const isSourceLink = (doc, url) => {
  try { const host = new URL(url).hostname.toLowerCase();
    return (externalSource(doc) && url === doc.externalUrl) || host.endsWith('.sharepoint.com') || host.endsWith('.service-now.com') || host.endsWith('.servicenow.com');
  } catch { return false; }
};
export async function scanDocumentLinks(prisma, { orgId, maxDocuments = 100, maxLinks = 250, maxRuntimeMs = 45 * 60_000, check = checkLink, now = new Date() } = {}) {
  if (!orgId) throw new Error('orgId required');
  const start = Date.now();
  // Persistent per-org cursor guarantees eventual coverage, even for documents
  // containing zero links. Avoid loading the entire tenant into memory.
  const key = 'links.check.cursor';
  const saved = await prisma.orgSetting.findUnique({ where: { orgId_key: { orgId, key } }, select: { value: true } });
  const cursor = typeof saved?.value === 'string' ? saved.value : '';
  const limit = Math.max(1, Math.min(maxDocuments, 500));
  const select = { id: true, content: true, externalUrl: true, sourceProvider: true, links: { select: { urlHash: true, url: true, checkedAt: true, firstBrokenAt: true, status: true, httpStatus: true } } };
  const later = await prisma.document.findMany({ where: { orgId, deletedAt: null, id: { gt: cursor } }, select, take: limit, orderBy: { id: 'asc' } });
  const earlier = later.length < limit ? await prisma.document.findMany({ where: { orgId, deletedAt: null, id: { lte: cursor } }, select, take: limit - later.length, orderBy: { id: 'asc' } }) : [];
  const docs = [...later, ...earlier];
  let scanned = 0, broken = 0, unknown = 0, processed = 0, lastId = cursor;
  for (const doc of docs) {
    if (scanned >= maxLinks || Date.now() - start > maxRuntimeMs) break;
    const urls = extractDocumentUrls(doc.content);
    if (doc.externalUrl && externalSource(doc)) urls.push(doc.externalUrl);
    const current = [...new Set(urls)].slice(0, 200);
    const existing = new Map(doc.links.map(link => [link.urlHash, link]));
    // Remove stale link rows, but preserve source-deletion evidence from sync.
    const activeHashes = new Set(current.map(urlHash));
    await prisma.documentLink.deleteMany({ where: { documentId: doc.id, urlHash: { notIn: [...activeHashes] }, NOT: { status: 'broken', url: doc.externalUrl || '' } } });
    for (const url of current) {
      if (scanned >= maxLinks || Date.now() - start > maxRuntimeMs) break;
      const hash = urlHash(url);
      const old = existing.get(hash);
      // Authenticated external sources are checked by sync, never public HTTP HEAD.
      const result = isSourceLink(doc, url) ? { status: old?.status || 'unknown', httpStatus: old?.httpStatus || null } : await check(url);
      const firstBrokenAt = result.status === 'broken' ? old?.firstBrokenAt || now : null;
      await prisma.documentLink.upsert({ where: { documentId_urlHash: { documentId: doc.id, urlHash: hash } }, create: { documentId: doc.id, url, urlHash: hash, ...result, checkedAt: now, firstBrokenAt }, update: { url, ...result, checkedAt: now, firstBrokenAt } });
      scanned++;
      if (result.status === 'broken') broken++;
      if (result.status === 'unknown') unknown++;
    }
    processed++;
    lastId = doc.id;
  }
  if (processed) await prisma.orgSetting.upsert({ where: { orgId_key: { orgId, key } },
    create: { orgId, key, value: lastId }, update: { value: lastId } });
  return { documents: processed, links: scanned, broken, unknown, partial: processed < docs.length || docs.length === limit };
}
