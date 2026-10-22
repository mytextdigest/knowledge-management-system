'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { validateWorkflowDraft } from '@/lib/workflows/uiValidation.mjs';
const emptyStage = () => ({name:'',approverUserId:''});
export default function WorkflowsPage() {
 const {orgId}=useParams();
 const [definitions,setDefinitions]=useState([]),[members,setMembers]=useState([]),[name,setName]=useState(''),[stages,setStages]=useState([emptyStage()]);
 const [kind,setKind]=useState('publish'),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
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
 useEffect(()=>{load()},[load]);
 const updateStage=(i,key,value)=>setStages(prev=>prev.map((s,j)=>j===i?{...s,[key]:value}:s));
 const create=async(e)=>{
  e.preventDefault();setError('');setNotice('');
  const issue=validateWorkflowDraft(name,stages);if(issue){setError(issue);return}
  setSaving(true);
  try{
   const res=await fetch(`/api/org/${orgId}/workflows`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim(),kind,stages})});
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to create workflow');
   setName('');setKind('publish');setStages([emptyStage()]);setNotice('Workflow created.');await load();
  }catch(err){setError(err.message)}finally{setSaving(false)}
 };
 return <Layout><main className="mx-auto max-w-5xl space-y-6 p-6">
  <header><h1 className="text-2xl font-semibold">Approval Workflows</h1><p className="text-sm text-gray-500">Super administrators can configure sequential review stages. Existing definitions are displayed below.</p></header>
  {error&&<p role="alert" className="rounded border border-red-300 p-3 text-red-600">{error}</p>}{notice&&<p role="status" className="text-green-700">{notice}</p>}
  <form onSubmit={create} className="space-y-4 rounded-xl border p-5">
   <h2 className="font-semibold">Create workflow</h2>
   <label className="block text-sm">Workflow name<input aria-label="Workflow name" maxLength={120} className="mt-1 w-full rounded border p-2" value={name} onChange={e=>setName(e.target.value)}/></label>
   <label className="block text-sm">Workflow type<select className="mt-1 w-full rounded border p-2" value={kind} onChange={e=>setKind(e.target.value)}><option value="publish">Publishing</option><option value="decommission">Decommission (archive / retire)</option></select></label>
   {stages.map((stage,i)=><div key={i} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_auto]">
    <label className="text-sm">Stage {i+1}<input aria-label={`Stage ${i+1} name`} maxLength={120} className="mt-1 w-full rounded border p-2" value={stage.name} onChange={e=>updateStage(i,'name',e.target.value)}/></label>
    <label className="text-sm">Reviewer<select aria-label={`Stage ${i+1} reviewer`} className="mt-1 w-full rounded border p-2" value={stage.approverUserId} onChange={e=>updateStage(i,'approverUserId',e.target.value)}><option value="">Select member</option>{members.map(m=><option key={m.userId} value={m.userId}>{m.name||m.email} ({m.role})</option>)}</select></label>
    <button type="button" disabled={stages.length===1} onClick={()=>setStages(prev=>prev.filter((_,j)=>j!==i))} className="rounded border px-3 py-2 disabled:opacity-40">Remove</button>
   </div>)}
   <div className="flex flex-wrap gap-3"><button type="button" disabled={stages.length>=12} className="rounded border px-3 py-2 disabled:opacity-40" onClick={()=>setStages(prev=>[...prev,emptyStage()])}>Add stage</button><button disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{saving?'Saving…':'Create workflow'}</button></div>
  </form>
  <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Existing workflows</h2><button className="rounded border px-3 py-1" onClick={load}>Refresh</button></div>
   {loading?<p>Loading…</p>:definitions.length===0?<p>No workflows configured.</p>:definitions.map(d=><article key={d.id} className="rounded-lg border p-4"><div className="flex justify-between gap-3"><strong>{d.name} ({d.kind||"publish"})</strong><span className="text-sm">{d.active?'Active':'Inactive'}</span></div><ol className="mt-2 list-inside list-decimal text-sm">{(d.stages||[]).map(s=><li key={s.id}>{s.name} — {members.find(m=>m.userId===s.approverUserId)?.name||members.find(m=>m.userId===s.approverUserId)?.email||'Assigned member'}</li>)}</ol></article>)}
  </section>
 </main></Layout>;
}
