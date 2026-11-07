'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { validateWorkflowDraft } from '@/lib/workflows/uiValidation.mjs';
import ScopePicker, { CATEGORIES } from '@/components/governance/ScopePicker';
// E22.2: a stage's reviewer is a role resolved per document, or a named person.
// The reviewer <select> encodes roles as "role:<type>" and people as their user id.
const ROLES = [
 {type:'dept_admin',label:"Department admin of the document's department",short:'Department admins',multi:true},
 {type:'owner',label:"The document's owner",short:'Document owner'},
 {type:'steward',label:"The document's stewards",short:'Document stewards',multi:true},
];
const emptyStage = () => ({name:'',approverType:'dept_admin',approverUserId:'',approvalMode:'any'});
const TEMPLATE = {name:'Department admin approval',kind:'publish',stages:[{name:'Department admin review',approverType:'dept_admin',approverUserId:'',approvalMode:'any'}]};
const reviewerValue = s => s.approverType==='user'?s.approverUserId:`role:${s.approverType}`;
export default function WorkflowsPage() {
 const {orgId}=useParams();
 const [definitions,setDefinitions]=useState([]),[members,setMembers]=useState([]),[departments,setDepartments]=useState([]),[name,setName]=useState(''),[stages,setStages]=useState([emptyStage()]);
 const [kind,setKind]=useState('publish'),[scope,setScope]=useState({departmentIds:[],categories:[]}),[editing,setEditing]=useState(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const [d,m]=await Promise.all([fetch(`/api/org/${orgId}/workflows`,{cache:'no-store'}),fetch(`/api/org/${orgId}/members`,{cache:'no-store'})]);
   const [dv,mv]=await Promise.all([d.json(),m.json()]);
   if(!d.ok)throw new Error(dv.error||'Unable to load workflows');
   if(!m.ok)throw new Error(mv.error||'Unable to load members');
   setDefinitions(dv.items||[]);setMembers(Array.isArray(mv)?mv:[]);
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[orgId]);
 useEffect(()=>{load();fetch(`/api/org/${orgId}/department`).then(r=>r.json()).then(d=>Array.isArray(d)&&setDepartments(d)).catch(()=>{})},[load,orgId]);
 const deptOptions=departments.map(d=>({value:d.id,label:d.name})),catOptions=CATEGORIES.map(c=>({value:c,label:c}));
 const coverage=d=>[(d.departmentIds||[]).length?(d.departmentIds.map(id=>departments.find(x=>x.id===id)?.name||'Unknown department').join(', ')):'All departments',(d.categories||[]).length?d.categories.join(', '):'all categories'].join(' · ');
 const person=id=>{const m=members.find(x=>x.userId===id);return m?.name||m?.email||'Assigned member'};
 const stageReviewer=s=>{const r=ROLES.find(x=>x.type===s.approverType);if(!r)return person(s.approverUserId);return r.multi?`${r.short} (${s.approvalMode==='all'?'all must approve':'any one'})`:r.short};
 const patch=async(d,body,message)=>{setError('');setNotice('');setSaving(true);
  try{const res=await fetch(`/api/org/${orgId}/workflows/${d.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to update workflow');
   setNotice(message);setEditing(null);await load();
  }catch(e){setError(e.message)}finally{setSaving(false)}};
 // On/off: an active publish workflow gates publication of the drafts it covers, an active decommission workflow their archive/retire.
 const toggle=d=>patch(d,{active:!d.active},d.active?`"${d.name}" turned off: ${(d.kind||'publish')==='publish'?'admins can publish the drafts it covered directly again':'archive and retire no longer need its approval'}. Running approvals finish as before.`:`"${d.name}" turned on.`);
 const updateStage=(i,patchValue)=>setStages(prev=>prev.map((s,j)=>j===i?{...s,...patchValue}:s));
 const chooseReviewer=(i,value)=>updateStage(i,value.startsWith('role:')?{approverType:value.slice(5),approverUserId:''}:{approverType:'user',approverUserId:value});
 const useTemplate=()=>{setName(TEMPLATE.name);setKind(TEMPLATE.kind);setStages(TEMPLATE.stages.map(s=>({...s})));setError('');setNotice('Template filled in: pick departments below or leave them empty for every department, then create.')};
 const create=async(e)=>{
  e.preventDefault();setError('');setNotice('');
  const issue=validateWorkflowDraft(name,stages);if(issue){setError(issue);return}
  setSaving(true);
  try{
   const body={name:name.trim(),kind,...scope,stages:stages.map(s=>({name:s.name,approverType:s.approverType,approvalMode:s.approvalMode,...(s.approverType==='user'?{approverUserId:s.approverUserId}:{})}))};
   const res=await fetch(`/api/org/${orgId}/workflows`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to create workflow');
   setName('');setKind('publish');setStages([emptyStage()]);setScope({departmentIds:[],categories:[]});setNotice('Workflow created.');await load();
  }catch(err){setError(err.message)}finally{setSaving(false)}
 };
 return <Layout><main className="mx-auto max-w-5xl space-y-6 p-6">
  <header><h1 className="text-2xl font-semibold">Approval Workflows</h1><p className="text-sm text-gray-500">Super administrators configure sequential review stages. A workflow covers the departments and categories you choose; when several cover a document, the most specific one applies.</p><p className="mt-1 text-sm">Periodic re-reviews of published documents are set up under <Link className="text-blue-600 underline" href={`/org/${orgId}/review-policies`}>Review policies</Link>.</p></header>
  {error&&<p role="alert" className="rounded border border-red-300 p-3 text-red-600">{error}</p>}{notice&&<p role="status" className="text-green-700">{notice}</p>}
  <form onSubmit={create} className="space-y-4 rounded-xl border p-5">
   <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Create workflow</h2><button type="button" onClick={useTemplate} className="rounded border px-3 py-1 text-sm">Use template: Department admin approval</button></div>
   <label className="block text-sm">Workflow name<input aria-label="Workflow name" maxLength={120} className="mt-1 w-full rounded border p-2" value={name} onChange={e=>setName(e.target.value)}/></label>
   <label className="block text-sm">Workflow type<select className="mt-1 w-full rounded border p-2" value={kind} onChange={e=>setKind(e.target.value)}><option value="publish">Publishing</option><option value="decommission">Decommission (archive / retire)</option></select></label>
   <ScopePicker legend="Departments" hint="Leave empty to cover every department." options={deptOptions} selected={scope.departmentIds} onChange={v=>setScope(p=>({...p,departmentIds:v}))}/>
   <ScopePicker legend="Categories" hint="Leave empty to cover every category." options={catOptions} selected={scope.categories} onChange={v=>setScope(p=>({...p,categories:v}))}/>
   {stages.map((stage,i)=>{const role=ROLES.find(r=>r.type===stage.approverType);return <div key={i} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1.4fr_auto]">
    <label className="text-sm">Stage {i+1}<input aria-label={`Stage ${i+1} name`} maxLength={120} className="mt-1 w-full rounded border p-2" value={stage.name} onChange={e=>updateStage(i,{name:e.target.value})}/></label>
    <div className="space-y-2">
     <label className="block text-sm">Reviewer<select aria-label={`Stage ${i+1} reviewer`} className="mt-1 w-full rounded border p-2" value={reviewerValue(stage)} onChange={e=>chooseReviewer(i,e.target.value)}>
      <optgroup label="Decided per document">{ROLES.map(r=><option key={r.type} value={`role:${r.type}`}>{r.label}</option>)}</optgroup>
      <optgroup label="A specific person"><option value="">Select member</option>{members.map(m=><option key={m.userId} value={m.userId}>{m.name||m.email} ({m.role})</option>)}</optgroup>
     </select></label>
     {role?.multi&&<label className="block text-sm">If there are several<select aria-label={`Stage ${i+1} approval mode`} className="mt-1 w-full rounded border p-2" value={stage.approvalMode} onChange={e=>updateStage(i,{approvalMode:e.target.value})}><option value="any">Any one of them approves</option><option value="all">All of them must approve</option></select></label>}
    </div>
    <button type="button" disabled={stages.length===1} onClick={()=>setStages(prev=>prev.filter((_,j)=>j!==i))} className="self-start rounded border px-3 py-2 disabled:opacity-40">Remove</button>
   </div>})}
   <p className="text-xs text-gray-500">Nobody approves their own submission: if the reviewer is the submitter or has left, the document&apos;s department admin is asked instead, otherwise a super admin.</p>
   <div className="flex flex-wrap gap-3"><button type="button" disabled={stages.length>=12} className="rounded border px-3 py-2 disabled:opacity-40" onClick={()=>setStages(prev=>[...prev,emptyStage()])}>Add stage</button><button disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{saving?'Saving…':'Create workflow'}</button></div>
  </form>
  <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Existing workflows</h2><button className="rounded border px-3 py-1" onClick={load}>Refresh</button></div>
   {loading?<p>Loading…</p>:definitions.length===0?<p>No workflows configured.</p>:definitions.map(d=><article key={d.id} className="space-y-2 rounded-lg border p-4">
    <div className="flex justify-between gap-3"><strong>{d.name} ({d.kind||"publish"})</strong><span className="flex items-center gap-2 text-sm">{d.active?'Active':'Off'}<button type="button" disabled={saving} onClick={()=>setEditing(editing?.id===d.id?null:{id:d.id,departmentIds:d.departmentIds||[],categories:d.categories||[]})} className="rounded border px-2 py-0.5 text-xs disabled:opacity-50">Edit coverage</button><button type="button" disabled={saving} onClick={()=>toggle(d)} className="rounded border px-2 py-0.5 text-xs disabled:opacity-50">{d.active?'Turn off':'Turn on'}</button></span></div>
    <p className="text-sm text-gray-500">Covers: {coverage(d)}</p>
    <ol className="list-inside list-decimal text-sm">{(d.stages||[]).map(s=><li key={s.id}>{s.name} — {stageReviewer(s)}</li>)}</ol>
    {editing?.id===d.id&&<div className="space-y-3 border-t pt-3">
     <ScopePicker legend="Departments" hint="Leave empty to cover every department." options={deptOptions} selected={editing.departmentIds} onChange={v=>setEditing(p=>({...p,departmentIds:v}))}/>
     <ScopePicker legend="Categories" hint="Leave empty to cover every category." options={catOptions} selected={editing.categories} onChange={v=>setEditing(p=>({...p,categories:v}))}/>
     <div className="flex gap-2"><button type="button" disabled={saving} onClick={()=>patch(d,{departmentIds:editing.departmentIds,categories:editing.categories},`"${d.name}" now covers: ${coverage({...d,...editing})}.`)} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">Save coverage</button><button type="button" onClick={()=>setEditing(null)} className="rounded border px-3 py-1.5 text-sm">Cancel</button></div>
    </div>}
   </article>)}
  </section>
 </main></Layout>;
}
