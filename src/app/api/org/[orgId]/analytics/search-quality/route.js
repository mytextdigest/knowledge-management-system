import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { departmentScope,dateWindow,qualityMetrics,linkedGaps,reportCsv,metricScope,metricBreakdown } from '@/lib/analytics/quality.mjs';
const headers={'Cache-Control':'no-store'};
export async function GET(req,{params}){
 const {orgId}=await params;const session=await getServerSession();if(!session?.user?.email)return Response.json({error:'Unauthorized'},{status:401,headers});
 const {user,role}=await resolveOrgRole(session.user.email,orgId);if(!user||!['super_admin','dept_admin'].includes(role))return Response.json({error:'Forbidden'},{status:403,headers});
 const p=new URL(req.url).searchParams;const ids=role==='dept_admin'?(await prisma.departmentMember.findMany({where:{userId:user.id,role:'admin',department:{orgId}},select:{departmentId:true}})).map(x=>x.departmentId):[];
 const requested=p.get('departmentId');const scope=departmentScope(role,ids,requested);if(!scope)return Response.json({error:'Forbidden'},{status:403,headers});
 if(requested&&!await prisma.department.findFirst({where:{id:requested,orgId}}))return Response.json({error:'Unknown department'},{status:404,headers});
 let createdAt;try{createdAt=dateWindow(p);}catch{return Response.json({error:'Invalid date range'},{status:400,headers});}
 const where={orgId,...scope,createdAt,...(p.get('sourceSystem')?{filters:{path:['sourceSystem'],equals:p.get('sourceSystem')}}:{})};
 const metric=p.get('metric');
 if(metric){const page=Number(p.get('page')||1);if(!metricScope(where,metric)||!Number.isSafeInteger(page)||page<1||page>10000)return Response.json({error:'Invalid drill-through'},{status:400,headers});const detail=await metricBreakdown(prisma,where,metric,page);if(p.get('format')==='csv')return new Response(reportCsv(detail.rows,['query','count']),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="search-quality-detail.csv"'}});return Response.json(detail,{headers});}
 const departments=await prisma.department.findMany({where:{orgId,...(role==='dept_admin'?{id:{in:ids}}:{})},select:{id:true,name:true},orderBy:{name:'asc'}});
 const [metrics,gaps]=await Promise.all([qualityMetrics(prisma,where),linkedGaps(prisma,where)]);
 if(p.get('format')==='csv'){const rows=[...Object.entries(metrics).filter(([,v])=>typeof v!=='object'||v===null).map(([metric,value])=>({metric,value})),...Object.entries(metrics.feedback).map(([k,value])=>({metric:'feedback:'+k,value})),...metrics.noResultQueries.map(x=>({metric:'no-results:'+x.query,value:x.count}))];return new Response(reportCsv(rows,['metric','value']),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="search-quality.csv"'}});}
 return Response.json({metrics,gaps,departments,permittedDepartmentIds:role==='dept_admin'?ids:null,showGovernance:role==='super_admin'},{headers});
}
