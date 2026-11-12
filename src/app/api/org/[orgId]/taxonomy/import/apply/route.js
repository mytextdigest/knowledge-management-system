import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, isSuperAdmin } from '@/lib/orgGuard';
import { MAX_IMPORT_BYTES } from '@/lib/taxonomy/import/preview.mjs';
import { applyImportedTaxonomy } from '@/lib/taxonomy/import/applyDb.mjs';
export const runtime='nodejs';
const fail=(error,status)=>NextResponse.json({error},{status});
export async function POST(req,{params}) {
  const {orgId}=await params;
  const session=await getServerSession();
  if(!session?.user?.email) return fail('Unauthorized',401);
  const actor=await resolveOrgRole(session.user.email,orgId);
  if(!actor.user || !isSuperAdmin(actor.role)) return fail('Forbidden',403);
  if(Number(req.headers.get('content-length'))>MAX_IMPORT_BYTES*2) return fail('Request too large',413);
  let body;try {body=await req.json();}catch{return fail('Invalid JSON',400);}
  if(!body || typeof body.termSetId!=='string' || body.confirmApply!==true || typeof body.confirmationToken!=='string') return fail('Explicit confirmation and preview token required',400);
  try {
    const result=await prisma.$transaction(tx=>applyImportedTaxonomy(tx,{orgId,termSetId:body.termSetId,format:body.format,content:body.content,confirmationToken:body.confirmationToken,actorUserId:actor.user.id}),{maxWait:10000,timeout:120000});
    return NextResponse.json({applied:true,...result});
  }catch(error){
    if(error?.code==='P2002' || error?.code==='P2034') return fail('Import conflict; preview again',409);
    if(/stale|changed|not found|read-only/.test(error?.message||'')) return fail(error.message,409);
    if(/required|Invalid|Unsupported|Cycle|Duplicate|Missing|stable|limit|exceeds|Too many/.test(error?.message||'')) return fail(error.message,400);
    console.error('Taxonomy import apply failed',error);
    return fail('Import failed; no changes committed',500);
  }
}
