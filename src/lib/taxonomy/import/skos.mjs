// Read-only SKOS importer for common Turtle and RDF/XML serializations.
// Strict subset: rejects unsupported constructs rather than silently losing concepts.
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const names = ['prefLabel','altLabel','hiddenLabel','definition','broader','narrower','related','inScheme'];
const decode = s => s.replace(/&(?:amp|lt|gt|quot|apos);/g, x => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[x]);
function finalize(triples) {
  const concepts = new Map(), schemes = new Set();
  const ensure = id => { if (!concepts.has(id)) concepts.set(id, {externalId:id,label:null,description:null,synonyms:[],hiddenLabels:[],parentExternalId:null,relatedExternalIds:[],schemeExternalId:null}); return concepts.get(id); };
  for (const [s,p,o,kind] of triples) {
    if (p === RDF+'type') { if (o === SKOS+'Concept') ensure(s); if (o === SKOS+'ConceptScheme') schemes.add(s); }
  }
  for (const [s,p,o,kind] of triples) {
    if (!concepts.has(s)) continue;
    const c = concepts.get(s);
    if (p === SKOS+'prefLabel' && kind === 'literal' && !c.label) c.label = o;
    if (p === SKOS+'altLabel' && kind === 'literal') c.synonyms.push(o);
    if (p === SKOS+'hiddenLabel' && kind === 'literal') c.hiddenLabels.push(o);
    if (p === SKOS+'definition' && kind === 'literal' && !c.description) c.description = o;
    if (p === SKOS+'broader' && kind === 'uri') { if (c.parentExternalId && c.parentExternalId !== o) throw new Error(`Multiple broader parents for ${s}`); c.parentExternalId = o; }
    if (p === SKOS+'related' && kind === 'uri') c.relatedExternalIds.push(o);
    if (p === SKOS+'inScheme' && kind === 'uri') c.schemeExternalId = o;
  }
  for (const [s,p,o,kind] of triples) if (p === SKOS+'narrower' && kind === 'uri' && concepts.has(o)) {
    const c = concepts.get(o); if (c.parentExternalId && c.parentExternalId !== s) throw new Error(`Multiple broader parents for ${o}`); c.parentExternalId = s;
  }
  for (const c of concepts.values()) {
    if (!c.label) throw new Error(`Concept ${c.externalId} has no prefLabel`);
    if (c.parentExternalId && !concepts.has(c.parentExternalId)) throw new Error(`Missing broader concept ${c.parentExternalId}`);
    c.synonyms = [...new Set(c.synonyms)]; c.hiddenLabels = [...new Set(c.hiddenLabels)]; c.relatedExternalIds = [...new Set(c.relatedExternalIds)];
  }
  for (const c of concepts.values()) { let p=c, visited=new Set(); while(p) { if(visited.has(p.externalId)) throw new Error(`Cycle at ${p.externalId}`); visited.add(p.externalId); p=p.parentExternalId ? concepts.get(p.parentExternalId) : null; } }
  return {concepts:[...concepts.values()],schemes:[...schemes],readOnly:true};
}
function tokenizeTurtle(input) {
  const re = /\s+|#[^\r\n]*|<[^>]*>|"(?:\\.|[^"\\])*"(?:@[a-zA-Z-]+|\^\^<[^>]*>)?|(?:@prefix|PREFIX)\b|[;,\.]|[A-Za-z][\w-]*:[\w.-]*|\ba\b/g;
  const tokens=[]; let pos=0, m;
  while ((m=re.exec(input)) !== null) {
    if (m.index !== pos) throw new Error(`Unsupported Turtle syntax near offset ${pos}`);
    pos=re.lastIndex; if (!/^\s|^#/.test(m[0])) tokens.push(m[0]);
  }
  if (pos !== input.length) throw new Error(`Unsupported Turtle syntax near offset ${pos}`);
  return tokens;
}
export function parseSkosTurtle(input) {
  const t=tokenizeTurtle(String(input)); const prefix={skos:SKOS,rdf:RDF}; const triples=[]; let i=0;
  const uri = x => { if(x==='a') return RDF+'type'; if(x.startsWith('<')) return x.slice(1,-1); const at=x.indexOf(':'); if(at<0 || !prefix[x.slice(0,at)]) throw new Error(`Unknown Turtle prefix: ${x}`); return prefix[x.slice(0,at)]+x.slice(at+1); };
  const obj = x => { if(x.startsWith('"')) { const m=x.match(/^("(?:\\.|[^"\\])*")/); return [JSON.parse(m[1]),'literal']; } return [uri(x),'uri']; };
  while(i<t.length) {
    if(t[i]==='@prefix'||t[i]==='PREFIX') { const keyword=t[i++]; const p=t[i++]; const u=t[i++]; if(!p?.endsWith(':')||!u?.startsWith('<')) throw new Error('Invalid prefix declaration'); prefix[p.slice(0,-1)]=uri(u); if(keyword==='@prefix'&&t[i++]!=='.') throw new Error('Expected prefix terminator'); continue; }
    const subject=uri(t[i++]); let predicate;
    do {
      predicate=uri(t[i++]); let value;
      do { value=obj(t[i++]); triples.push([subject,predicate,value[0],value[1]]); } while(t[i]===',' && ++i);
      if(t[i]===';') { i++; if(t[i]==='.') break; } else break;
    } while(i<t.length);
    if(t[i++]!=='.') throw new Error('Expected Turtle statement terminator');
  }
  return finalize(triples);
}
// XML parsing is deliberately fail-closed: only direct rdf:Description/skos:Concept
// with explicit rdf:about and simple child elements is supported.
export function parseSkosRdfXml(input) {
  const xml=String(input);
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml)) throw new Error('External XML entities and DTDs are not allowed');
  const root=xml.match(/<rdf:RDF\b([^>]*)>([\s\S]*)<\/rdf:RDF\s*>\s*$/);
  if(!root) throw new Error('Expected rdf:RDF root');
  const attrs = Object.fromEntries([...root[1].matchAll(/\b(xmlns(?::[\w-]+)?)\s*=\s*"([^"]*)"/g)].map(m=>[m[1],m[2]]));
  if(attrs['xmlns:rdf']!==RDF || attrs['xmlns:skos']!==SKOS) throw new Error('Expected standard rdf and skos namespace declarations');
  const triples=[]; let remaining=root[2].trim();
  const element=/<(skos:Concept|skos:ConceptScheme|rdf:Description)\b([^>]*)>([\s\S]*?)<\/\1\s*>\s*/y;
  while(remaining) {
    element.lastIndex=0; const m=element.exec(remaining); if(!m) throw new Error('Unsupported RDF/XML structure');
    remaining=remaining.slice(m[0].length).trim(); const id=m[2].match(/\brdf:about="([^"]+)"/); if(!id) throw new Error('RDF/XML concept requires rdf:about'); const subject=decode(id[1]);
    if(m[1]==='skos:Concept'||m[1]==='skos:ConceptScheme') triples.push([subject,RDF+'type',SKOS+m[1].slice(5),'uri']);
    let children=m[3].trim();
    while(children) {
      const resource=children.match(/^<skos:([\w]+)\b[^>]*\brdf:resource="([^"]+)"\s*\/\s*>\s*/);
      const literal=children.match(/^<skos:([\w]+)(?:\s+xml:lang="[^"]+")?\s*>([^<]*)<\/skos:\1\s*>\s*/);
      const child=resource||literal; if(!child||!names.includes(child[1])) throw new Error('Unsupported RDF/XML property');
      triples.push([subject,SKOS+child[1],decode(child[2]),resource?'uri':'literal']); children=children.slice(child[0].length).trim();
    }
  }
  return finalize(triples);
}
