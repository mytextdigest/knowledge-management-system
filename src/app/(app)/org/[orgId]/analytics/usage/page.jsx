'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
const pct=n=>`${(100*n).toFixed(1)}%`;
export default function UsageAnalyticsPage(){
  const {orgId}=useParams(); const [days,setDays]=useState('7');const [departmentId,setDepartmentId]=useState('');const [role,setRole]=useState('');
  const [data,setData]=useState(null);const [error,setError]=useState('');const [loading,setLoading]=useState(false);
  const query=new URLSearchParams({days,...(departmentId.trim()?{departmentId:departmentId.trim()}:{}),...(role?{role}:{})});
  useEffect(()=>{let active=true;setLoading(true);setError('');fetch(`/api/org/${encodeURIComponent(orgId)}/analytics/usage?${query}`,{cache:'no-store'}).then(async r=>{const p=await r.json();if(!r.ok)throw Error(p.error||'Unable to load');return p;}).then(p=>{if(active)setData(p);}).catch(e=>{if(active){setError(e.message);setData(null);}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[orgId,days,departmentId,role]);
  const s=data?.summary;
  const cards=s?[['Searches',s.searches],['Questions',s.questions],['Active users',s.activeUsers],['Click-through rate',pct(s.ctr)],['Bounce rate',pct(s.bounceRate)],['p50 latency',s.p50LatencyMs===null?'N/A':`${s.p50LatencyMs} ms`],['p95 latency',s.p95LatencyMs===null?'N/A':`${s.p95LatencyMs} ms`],['p95 first token',s.p95FirstTokenMs===null?'N/A':`${s.p95FirstTokenMs} ms`]]:[];
  return <Layout><main className="mx-auto max-w-6xl p-6 space-y-5"><header className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Usage & adoption</h1><Link className="underline" href={`/org/${orgId}/analytics`}>Search activity</Link></header>
    <p className="text-sm text-gray-500">UTC daily usage. CTR counts events with at least one click; bounce rate counts events without clicks. Only recorded users count as active.</p>
    <div className="flex flex-wrap gap-3 items-end"><label>Period<select className="block border rounded p-2" value={days} onChange={e=>setDays(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label><label>Department ID<input className="block border rounded p-2" placeholder="All permitted" value={departmentId} onChange={e=>setDepartmentId(e.target.value)}/></label><label>Role<input className="block border rounded p-2" placeholder="All roles" value={role} onChange={e=>setRole(e.target.value)}/></label><a className="rounded border px-4 py-2" href={`/api/org/${encodeURIComponent(orgId)}/analytics/usage?${query}&format=csv`}>Export CSV</a></div>
    {loading&&<p>Loading usage metrics…</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}
    {s&&<><div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{cards.map(([label,value])=><div key={label} className="rounded-xl border p-4"><div className="text-sm text-gray-500">{label}</div><div className="text-2xl font-semibold">{value}</div></div>)}</div>
    <section className="rounded-xl border p-4 overflow-x-auto"><h2 className="font-semibold mb-3">Daily activity</h2><table className="w-full text-sm text-left"><thead><tr>{['Date','Searches','Questions','Active users','CTR','Bounce','p95 ms'].map(x=><th className="p-2 border-b" key={x}>{x}</th>)}</tr></thead><tbody>{data.daily.map(d=><tr key={d.date}><td className="p-2 border-b">{d.date}</td><td>{d.searches}</td><td>{d.questions}</td><td>{d.activeUsers}</td><td>{pct(d.ctr)}</td><td>{pct(d.bounceRate)}</td><td>{d.p95LatencyMs??'N/A'}</td></tr>)}</tbody></table></section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Top queries</h2><ol>{s.topQueries.map(q=><li key={q.query} className="py-1">{q.query} — {q.count}</li>)}</ol></section></>}
  </main></Layout>;
}
