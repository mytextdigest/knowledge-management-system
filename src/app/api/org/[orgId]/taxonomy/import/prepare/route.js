import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, isSuperAdmin } from '@/lib/orgGuard';
import { prepareImportApply } from '@/lib/taxonomy/import/applyGuard.mjs';
import { MAX_IMPORT_BYTES } from '@/lib/taxonomy/import/preview.mjs';
export const runtime = 'nodejs';
const fail = (error, status) => NextResponse.json({ error }, { status });
export async function POST(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized',401);
  const actor = await resolveOrgRole(session.user.email,orgId);
  if (!actor.user || !isSuperAdmin(actor.role)) return fail('Forbidden',403);
  if (Number(req.headers.get('content-length')) > MAX_IMPORT_BYTES*2) return fail('Request too large',413);
  let body; try { body = await req.json(); } catch { return fail('Invalid JSON',400); }
  if (!body || typeof body.termSetId !== 'string') return fail('termSetId required',400);
  const set = await prisma.termSet.findFirst({where:{id:body.termSetId,orgId},select:{id:true,source:true,readOnly:true}});
  if (!set) return fail('Term set not found',404);
  if (set.source !== 'external' || !set.readOnly) return fail('Only external read-only term sets can be synchronized',409);
  const terms = await prisma.term.findMany({where:{termSetId:set.id},select:{id:true,externalId:true,parentId:true,label:true,description:true,status:true,synonyms:{select:{normalizedLabel:true,kind:true}}}});
  try { return NextResponse.json({termSetId:set.id,...prepareImportApply({termSetId:set.id,format:body.format,content:body.content,terms})}); }
  catch(e) { return fail(e.message || 'Invalid import',400); }
}
