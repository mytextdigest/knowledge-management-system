import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { normalizeTaskFilter, taskWhere } from '@/lib/workflows/taskInbox.mjs';

export async function GET(request,{params}) {
 const {orgId}=await params;
 const session=await getServerSession();
 if (!session?.user?.email) return NextResponse.json({error:'Unauthorized'},{status:401});
 const {user,role}=await resolveOrgRole(session.user.email,orgId);
 if (!user||!role) return NextResponse.json({error:'Forbidden'},{status:403});
 const url=new URL(request.url);
 const filter=normalizeTaskFilter(url.searchParams.get('status'));
 try {
  const where=taskWhere({orgId,userId:user.id,filter});
  const [items, pendingCount]=await Promise.all([
   prisma.workflowTask.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:100,
    select:{id:true,status:true,createdAt:true,decidedAt:true,stage:{select:{name:true,position:true}},instance:{select:{id:true,status:true,documentId:true,submittedById:true,createdAt:true,definition:{select:{name:true}}}}}}),
   prisma.workflowTask.count({where:taskWhere({orgId,userId:user.id,filter:'pending'})})
  ]);
  return NextResponse.json({items,pendingCount,filter,limit:100});
 } catch(error) {console.error('Workflow task inbox failed',error);return NextResponse.json({error:'Unable to load tasks'},{status:500})}
}
