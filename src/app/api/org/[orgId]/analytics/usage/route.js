import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { dailyUsage, summarizeUsage, usageCsv } from '@/lib/analytics/usageMetrics.mjs';

const deny=(message,status)=>NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request,{params}) {
  const {orgId}=await params;
  const session=await getServerSession();
  if(!session?.user?.email) return deny('Unauthorized',401);
  const {user,role}=await resolveOrgRole(session.user.email,orgId);
  if(!user || !['super_admin','dept_admin'].includes(role)) return deny('Forbidden',403);
  const url=new URL(request.url);
  const days=Number(url.searchParams.get('days') || 7);
  if(![7,30,90].includes(days)) return deny('Invalid reporting period',400);
  const requestedDepartment=url.searchParams.get('departmentId') || null;
  const requestedRole=url.searchParams.get('role') || null;
  if(requestedRole && !/^[a-z_]{2,32}$/.test(requestedRole)) return deny('Invalid role',400);
  let allowed=null;
  if(role==='dept_admin') {
    const members=await prisma.departmentMember.findMany({where:{userId:user.id,role:'admin',department:{orgId}},select:{departmentId:true}});
    allowed=members.map(m=>m.departmentId);
    if(!allowed.length || (requestedDepartment && !allowed.includes(requestedDepartment))) return deny('Forbidden',403);
  }
  const since=new Date(); since.setUTCHours(0,0,0,0); since.setUTCDate(since.getUTCDate()-days+1);
  const where={orgId,createdAt:{gte:since},...(requestedDepartment?{departmentId:requestedDepartment}:allowed?{departmentId:{in:allowed}}:{}),...(requestedRole?{role:requestedRole}:{})};
  try {
    const events=[];
    let cursor;
    do {
      const page=await prisma.searchEvent.findMany({where,select:{id:true,kind:true,userId:true,query:true,normalizedQuery:true,createdAt:true,latencyMs:true,firstTokenMs:true},orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})});
      events.push(...page);
      cursor=page.length===500?page.at(-1).id:null;
    }while(cursor);
    const clicks=[];
    for(let i=0;i<events.length;i+=500) {
      const ids=events.slice(i,i+500).map(e=>e.id);
      if(!ids.length) continue;
      let clickCursor;
      do {
        const page=await prisma.searchClick.findMany({where:{searchEventId:{in:ids}},select:{id:true,searchEventId:true},orderBy:{id:'asc'},take:500,...(clickCursor?{cursor:{id:clickCursor},skip:1}:{})});
        clicks.push(...page);
        clickCursor=page.length===500?page.at(-1).id:null;
      }while(clickCursor);
    }
    const rows=dailyUsage(events,clicks);
    if(url.searchParams.get('format')==='csv') return new Response(usageCsv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="kms-usage.csv"','Cache-Control':'no-store'}});
    return NextResponse.json({filters:{days,departmentId:requestedDepartment,role:requestedRole,scope:allowed?'managed_departments':'organization'},summary:summarizeUsage(events,clicks),daily:rows},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {console.error('Usage analytics failed:',error?.message);return deny('Unable to load usage analytics',500);}
}
