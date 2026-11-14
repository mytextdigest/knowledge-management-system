import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { resolveOrgRole } from '@/lib/orgGuard';
import { SETTINGS_REGISTRY } from '@/lib/settings/registry.mjs';
import { getSetting, setSetting } from '@/lib/settings';
async function authorize(params) {
 const session=await getServerSession();
 if (!session?.user?.email) return {error:'Unauthorized',status:401};
 const {orgId}=await params;
 const {user,role}=await resolveOrgRole(session.user.email,orgId);
 if (!user || !role) return {error:'Forbidden',status:403};
 if (!['super_admin','dept_admin'].includes(role)) return {error:'Forbidden',status:403};
 return {orgId,user,role};
}
export async function GET(req,{params}) {
 const auth=await authorize(params);
 if(auth.error) return NextResponse.json({error:auth.error},{status:auth.status});
 const entries=await Promise.all(Object.entries(SETTINGS_REGISTRY).map(async ([key,entry]) => ({key,label:entry.label,value:await getSetting(auth.orgId,key),editable:auth.role==='super_admin'})));
 return NextResponse.json({settings:entries});
}
export async function PATCH(req,{params}) {
 const auth=await authorize(params);
 if(auth.error) return NextResponse.json({error:auth.error},{status:auth.status});
 if(auth.role!=='super_admin') return NextResponse.json({error:'Forbidden'},{status:403});
 let body;try {body=await req.json();}catch {return NextResponse.json({error:'Invalid JSON'},{status:400});}
 if(!body || typeof body.key!=='string' || !Object.hasOwn(body,'value')) return NextResponse.json({error:'key and value required'},{status:400});
 try {const value=await setSetting({orgId:auth.orgId,key:body.key,value:body.value,actorUserId:auth.user.id});return NextResponse.json({key:body.key,value});}
 catch(error) {if(/^(Unknown governance setting|Invalid value)/.test(error.message)) return NextResponse.json({error:error.message},{status:422});throw error;}
}
