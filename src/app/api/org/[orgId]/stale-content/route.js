import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { scanStaleContent } from '@/lib/governance/staleScan';
import { validateStaleScanOptions } from '@/lib/governance/staleContent.mjs';
const fail = (error, status) => NextResponse.json({ error }, { status });
async function authorize(orgId) {
 const session = await getServerSession();
 if (!session?.user?.email) return { error: fail('Unauthorized', 401) };
 const { user, role } = await resolveOrgRole(session.user.email, orgId);
 if (!user || !role) return { error: fail('Forbidden', 403) };
 return { user, role };
}
export async function GET(request, { params }) {
 const { orgId } = await params;
 const auth = await authorize(orgId);
 if (auth.error) return auth.error;
 if (!['super_admin', 'dept_admin'].includes(auth.role)) return fail('Forbidden', 403);
 const url = new URL(request.url);
 const status = url.searchParams.get('status') || 'flagged';
 if (!['flagged', 'all'].includes(status)) return fail('Invalid status', 400);
 const items = await prisma.document.findMany({
  where: { orgId, scope: 'repository', deletedAt: null, ...(status === 'flagged' ? { lifecycleSuggestion: 'archived' } : {}) },
  select: { id: true, filename: true, ownerId: true, lifecycle: true, lifecycleSuggestion: true,
   lifecycleSuggestionReason: true, lifecycleSuggestedAt: true },
  orderBy: { lifecycleSuggestedAt: 'desc' }, take: 100,
 });
 return NextResponse.json({ items });
}
export async function POST(request, { params }) {
 const { orgId } = await params;
 const auth = await authorize(orgId);
 if (auth.error) return auth.error;
 if (auth.role !== 'super_admin') return fail('Forbidden', 403);
 let body;
 try { body = await request.json(); } catch { return fail('Invalid JSON', 400); }
 const options = validateStaleScanOptions(body);
 if (options.error) return fail(options.error, 400);
 try { return NextResponse.json(await scanStaleContent({ orgId, actorUserId: auth.user.id, ...options })); }
 catch (error) { console.error('Stale scan failed', error); return fail('Stale scan failed', 500); }
}
