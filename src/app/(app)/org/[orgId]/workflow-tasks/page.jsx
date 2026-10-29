'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { validateTaskDecision } from '@/lib/workflows/taskInbox.mjs';

const filters=[['pending','Pending'],['completed','Completed'],['all','All']];
const actions=[['approve','Approve'],['request_changes','Request changes'],['reject','Reject']];
export default function WorkflowTasksPage(){
 const {orgId}=useParams();
 const [filter,setFilter]=useState('pending'),[items,setItems]=useState([]),[pendingCount,setPendingCount]=useState(0);
 const [loading,setLoading]=useState(true),[busyId,setBusyId]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [drafts,setDrafts]=useState({});
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try {const res=await fetch(`/api/org/${orgId}/workflow-tasks?status=${filter}`,{cache:'no-store'});
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load tasks');
   setItems(data.items||[]);setPendingCount(data.pendingCount||0);
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[orgId,filter]);
 useEffect(()=>{load()},[load]);
 const update=(id,key,value)=>setDrafts(p=>({...p,[id]:{...p[id],[key]:value}}));
 const decide=async(task)=>{
  const draft=drafts[task.id]||{};const action=draft.action||'approve';const comment=draft.comment||'';
  const issue=validateTaskDecision(action,comment);if(issue){setError(issue);return}
  if(!window.confirm(`Confirm ${action.replaceAll('_',' ')} for this document?`))return;
  setBusyId(task.id);setError('');setNotice('');
  try{const res=await fetch(`/api/org/${orgId}/workflow-tasks/${task.id}/decision`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,comment})});
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Decision failed');
   setNotice(`Decision recorded. Workflow status: ${data.status.replaceAll('_',' ')}.`);await load();
  }catch(e){setError(e.message)}finally{setBusyId('')}
 };
 return <Layout><main className="mx-auto max-w-5xl space-y-5 p-6">
  <header><h1 className="text-2xl font-semibold">My Workflow Tasks</h1><p className="text-sm text-gray-500">Only review tasks assigned to your account are shown. Pending tasks: {pendingCount}.</p></header>
  {error&&<p role="alert" className="rounded border border-red-300 p-3 text-red-700">{error}</p>}
  {notice&&<p role="status" className="rounded border p-3 text-green-700">{notice}</p>}
  <div className="flex flex-wrap gap-2">{filters.map(([key,label])=><button key={key} onClick={()=>setFilter(key)} aria-pressed={filter===key} className={`rounded border px-3 py-2 text-sm ${filter===key?'bg-blue-700 text-white':''}`}>{label}</button>)}<button onClick={load} className="rounded border px-3 py-2 text-sm">Refresh</button></div>
  {loading?<p>Loading tasks…</p>:items.length===0?<p>No {filter==='all'?'':filter} tasks found.</p>:<div className="space-y-3">{items.map(task=>{
   const draft=drafts[task.id]||{};const action=draft.action||'approve';
   return <article key={task.id} className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">{task.instance.definition.name} — {task.stage.name}</h2><p className="text-sm text-gray-500">Stage {task.stage.position} · Assigned {new Date(task.createdAt).toLocaleString()}</p></div><span className="rounded border px-2 py-1 text-sm">{task.status.replaceAll('_',' ')}</span></div>
    <p className="text-sm">Workflow: {task.instance.status.replaceAll('_',' ')}</p>
    <Link className="text-sm text-blue-600 underline" href={`/document?id=${encodeURIComponent(task.instance.documentId)}`}>Open document</Link>
    {task.status==='pending'&&task.instance.status==='in_review'&&<div className="space-y-2 border-t pt-3"><label className="block text-sm">Decision<select aria-label={`Decision for ${task.id}`} value={action} onChange={e=>update(task.id,'action',e.target.value)} className="mt-1 block w-full rounded border p-2">{actions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     <label className="block text-sm">Comment {action==='approve'?'(optional)':'(required)'}<textarea maxLength={2000} value={draft.comment||''} onChange={e=>update(task.id,'comment',e.target.value)} className="mt-1 block w-full rounded border p-2" rows={2}/></label>
     <button disabled={!!busyId} onClick={()=>decide(task)} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{busyId===task.id?'Saving…':'Submit decision'}</button>
    </div>}
   </article>
  })}</div>}
 </main></Layout>;
}
