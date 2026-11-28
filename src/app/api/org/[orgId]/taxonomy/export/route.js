import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole,isSuperAdmin } from "@/lib/orgGuard";
import { exportTaxonomy } from "@/lib/taxonomy/export.mjs";
export async function GET(req,{params}){
 const session=await getServerSession();if(!session?.user?.email)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {orgId}=await params;const {role}=await resolveOrgRole(session.user.email,orgId);if(!isSuperAdmin(role))return NextResponse.json({error:"Forbidden"},{status:403});
 const p=new URL(req.url).searchParams;const format=p.get('format');if(!['ttl','csv'].includes(format))return NextResponse.json({error:'Invalid format'},{status:400});
 const set=await prisma.termSet.findFirst({where:{id:p.get('id')||'',orgId},include:{terms:{include:{synonyms:true,relationsFrom:true}}}});if(!set)return NextResponse.json({error:'Not found'},{status:404});
 return new Response(exportTaxonomy(set,format),{headers:{'Content-Type':format==='ttl'?'text/turtle; charset=utf-8':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="taxonomy.${format}"`,'Cache-Control':'no-store'}});
}
