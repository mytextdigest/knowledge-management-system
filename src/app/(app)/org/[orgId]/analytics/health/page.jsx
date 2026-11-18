"use client";
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import AnalyticsTabs from '@/components/analytics/AnalyticsTabs';
export default function ContentHealthPage(){
  const {orgId}=useParams();const [data,setData]=useState(null);const [error,setError]=useState('');
  const [departmentId,setDepartmentId]=useState('');const [sourceSystem,setSourceSystem]=useState('');const [metric,setMetric]=useState('');
  const params=new URLSearchParams();if(departmentId)params.set('departmentId',departmentId);if(sourceSystem)params.set('sourceSystem',sourceSystem);if(metric)params.set('metric',metric);
  const path=`/api/org/${orgId}/analytics/health?${params}`;
  useEffect(()=>{let active=true;fetch(path,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}).then(d=>{if(active){setData(d);setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[path]);
  const measures=[['stale','Stale documents'],['unowned','Missing owners'],['reviewDue','Reviews due'],['reviewOverdue','Overdue reviews'],['broken','Documents with broken links'],['duplicate','Open duplicate flags'],['incomplete','Missing required metadata']];
  const total=data?.counts?.total||0;
  return <Layout><div className="mx-auto max-w-6xl space-y-5 p-6"><h1 className="text-2xl font-semibold">Content health</h1><AnalyticsTabs orgId={orgId}/>
  <div className="flex flex-wrap gap-3"><label>Department ID <input className="rounded border p-2" value={departmentId} onChange={e=>setDepartmentId(e.target.value)} placeholder="All permitted"/></label><label>Source <select className="rounded border p-2" value={sourceSystem} onChange={e=>setSourceSystem(e.target.value)}><option value="">All sources</option><option value="manual">Manual</option><option value="sharepoint">SharePoint</option><option value="servicenow">ServiceNow</option></select></label><a className="self-end underline" href={`${path}&format=csv`}>Export CSV</a></div>
  {error&&<p role="alert" className="text-red-600">{error}</p>}
  {data&&<><p>{total} accessible documents · {data.filters.scope}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{measures.map(([key,label])=><button key={key} onClick={()=>setMetric(metric===key?'':key)} className={`rounded border p-4 text-left ${metric===key?'border-blue-600':''}`}><span className="block text-sm">{label}</span><strong className="text-2xl">{key==='broken'?data.counts.brokenLinks:key==='duplicate'?data.counts.duplicates:key==='unowned'?total-data.counts.owned:key==='incomplete'?total-data.counts.complete:data.counts[key]}</strong></button>)}</div>
  <p>Recency: {data.buckets.under30} under 30 days · {data.buckets.days30to90} 30–89 days · {data.buckets.over90} 90+ days</p>
  <h2 className="font-semibold">Document drill-through {metric&&`— ${metric}`}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Document</th><th>Age (days)</th><th>Broken links</th><th>Missing metadata</th></tr></thead><tbody>{data.documents.map(d=><tr key={d.id} className="border-t"><td className="p-2"><Link className="underline" href={`/document?id=${encodeURIComponent(d.id)}`}>{d.filename}</Link></td><td>{d.ageDays}</td><td>{d.brokenLinks}</td><td>{d.missing.join(', ')||'—'}</td></tr>)}</tbody></table></div></>}
  </div></Layout>;
}
