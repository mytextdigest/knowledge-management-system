"use client";
import {use,useState,useEffect,useRef} from "react";
import Link from "next/link";
import Layout from "@/components/layout/Layout";
import CorpusFilterInputs from "@/components/taxonomy/CorpusFilterInputs";
import FacetPanel from "@/components/taxonomy/FacetPanel";
export default function SearchPage({params}) {
 const {orgId}=use(params);
 const [input,setInput]=useState("");const [query,setQuery]=useState("");
 const [selected,setSelected]=useState({});const [facets,setFacets]=useState([]);
 const [results,setResults]=useState([]);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 const [filters,setFilters]=useState({});
 const [scope,setScope]=useState("organization");const [revision,setRevision]=useState(0);
 const request=useRef(0);
 useEffect(()=>{
  if(!query)return;
  const id=++request.current;const controller=new AbortController();
  async function load(){setBusy(true);setError("");setResults([]);setFacets([]);
   try{const res=await fetch(`/api/org/${orgId}/search`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query,scope:filters.departmentId?"department":scope,departmentId:filters.departmentId,filters,facetSelections:selected}),signal:controller.signal});const data=await res.json();if(!res.ok)throw new Error(data.error||"Search failed");if(id===request.current){setResults(data.results||[]);setFacets(data.facets||[]);}}
   catch(e){if(id===request.current&&!controller.signal.aborted)setError(e.message);}
   finally{if(id===request.current&&!controller.signal.aborted)setBusy(false);}}
  load();return ()=>controller.abort();
 },[orgId,query,scope,selected,revision,filters]);
 return <Layout orgId={orgId}><main className="space-y-4 p-6"><Link className="underline" href={`/org/${orgId}/repository`}>Knowledge Repository</Link><h1 className="text-2xl font-semibold">Knowledge Search</h1><form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();if(input.trim()){setQuery(input.trim());setRevision(v=>v+1);}}}><input aria-label="Search query" className="border rounded p-2 flex-1" value={input} onChange={e=>setInput(e.target.value)} required/><select aria-label="Search scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="organization">Organization</option><option value="department">My departments</option><option value="personal">Personal</option></select><button className="border rounded p-2" type="submit">Search</button></form><CorpusFilterInputs value={filters} onChange={setFilters} extended/><FacetPanel facets={facets} selected={selected} onChange={setSelected}/>{busy&&<p role="status">Searching…</p>}{error&&<p role="alert">{error}</p>}{!busy&&!error&&query&&!results.length&&<p>No matching results.</p>}{results.map((r,i)=><article key={`${r.chunkId||r.documentId}-${i}`} className="border rounded p-4"><h2 className="font-semibold">{r.filename}</h2><p>{r.text||r.summary}</p>{r.viewerUrl&&<Link className="underline" href={r.viewerUrl}>Open document</Link>}</article>)}</main></Layout>;
}
