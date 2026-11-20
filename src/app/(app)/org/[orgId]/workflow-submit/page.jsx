'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { parseDocumentId } from '@/lib/workflows/uiValidation.mjs';
export default function WorkflowSubmitPage(){
 const {orgId}=useParams(),search=useSearchParams();
 const [documentId,setDocumentId]=useState(search.get('documentId')||''),[definitions,setDefinitions]=useState([]),[definitionId,setDefinitionId]=useState('');
 const [targetLifecycle,setTargetLifecycle]=useState('archived'),[items,setItems]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const loadDefinitions=useCallback(async()=>{try{const r=await fetch(`/api/org/${orgId}/workflows`,{cache:'no-store'}),v=await r.json();if(!r.ok)throw new Error(v.error||'Unable to load workflows');setDefinitions((v.items||[]).filter(d=>d.active));}catch(e){setError(e.message)}},[orgId]);
 useEffect(()=>{loadDefinitions()},[loadDefinitions]);
 const loadHistory=useCallback(async(id)=>{setLoading(true);try{const r=await fetch(`/api/documents/${id}/workflow`,{cache:'no-store'}),v=await r.json();if(!r.ok)throw new Error(v.error||'Unable to load history');setItems(v.items||[])}catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{const id=parseDocumentId(documentId);if(id)loadHistory(id);else setItems([])},[documentId,loadHistory]);
 const submit=async(e)=>{e.preventDefault();setError('');setNotice('');const id=parseDocumentId(documentId);if(!id){setError('Enter a valid repository document ID.');return}if(!definitionId){setError('Select a workflow.');return}setBusy(true);
  try{const r=await fetch(`/api/documents/${id}/workflow`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({definitionId,...(definitions.find(d=>d.id===definitionId)?.kind==='decommission'?{targetLifecycle}:{})})}),v=await r.json();if(!r.ok)throw new Error(v.error||'Submission failed');setNotice('Document submitted for approval.');await loadHistory(id)}catch(err){setError(err.message)}finally{setBusy(false)}
 };
 return <Layout><main className="mx-auto max-w-4xl space-y-5 p-6"><h1 className="text-2xl font-semibold">Submit Document for Approval</h1><p className="text-sm text-gray-500">Submit a repository document you own or uploaded. Reviewers cannot approve their own submission.</p>
  {error&&<p role="alert" className="text-red-600">{error}</p>}{notice&&<p role="status" className="text-green-700">{notice}</p>}
  <form onSubmit={submit} className="space-y-4 rounded-lg border p-4"><label className="block text-sm">Document ID<input aria-label="Document ID" className="mt-1 w-full rounded border p-2" value={documentId} onChange={e=>setDocumentId(e.target.value)}/></label>
   <label className="block text-sm">Approval workflow<select aria-label="Approval workflow" className="mt-1 w-full rounded border p-2" value={definitionId} onChange={e=>setDefinitionId(e.target.value)}><option value="">Select workflow</option>{definitions.map(d=><option key={d.id} value={d.id}>{d.name} ({d.stages?.length||0} stages)</option>)}</select></label>
   {definitions.find(d=>d.id===definitionId)?.kind==='decommission'&&<label className="block text-sm">Requested decommission action<select className="mt-1 w-full rounded border p-2" value={targetLifecycle} onChange={e=>setTargetLifecycle(e.target.value)}><option value="archived">Archive</option><option value="retired">Retire</option></select></label>}
   <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{busy?'Submitting…':'Submit for approval'}</button></form>
  <section className="space-y-3"><h2 className="text-lg font-semibold">Submission history</h2>{loading?<p>Loading…</p>:items.length===0?<p>No workflow submissions found for this document.</p>:items.map(w=><article key={w.id} className="rounded border p-3"><strong>Status: {w.targetLifecycle?`Decommission → ${w.targetLifecycle} · `:""}{w.status.replaceAll('_',' ')}</strong><p className="text-sm">Submitted {new Date(w.createdAt).toLocaleString()}</p><ol className="mt-2 list-inside list-decimal text-sm">{(w.tasks||[]).map(t=><li key={t.id}>{t.stage?.name||'Stage'}: {t.status}</li>)}</ol></article>)}</section>
 </main></Layout>;
}
