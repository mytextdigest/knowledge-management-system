// C-6: SKOS importer for Turtle and RDF/XML (E16.1, E16.2). Reads the RDF into
// triples, then picks out concepts. Exports from taxonomy tools (Semaphore,
// PoolParty, VocBench) carry many non-SKOS properties, several languages and
// SKOS-XL labels; those are read or ignored, never a reason to fail. Only
// what would lose or corrupt concepts is an error.

const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const SKOSXL = 'http://www.w3.org/2008/05/skos-xl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

export const MAX_TRIPLES = 2_000_000;

function resolveIri(iri, base) {
  if (!base || /^[a-z][a-z0-9+.-]*:/i.test(iri)) return iri;
  try { return new URL(iri, base).href; } catch { return iri; }
}

// ---------------------------------------------------------------- Turtle --

const PN_CHARS = /[A-Za-z0-9_\-.\u00B7\u00C0-\uFFFF%\\:]/;

function turtleLexer(input) {
  let pos = 0;
  const len = input.length;
  const error = (msg) => { throw new Error(`Turtle: ${msg} at offset ${pos}`); };
  function skip() {
    while (pos < len) {
      const c = input[pos];
      if (c === '#') { while (pos < len && input[pos] !== '\n' && input[pos] !== '\r') pos++; }
      else if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\uFEFF') pos++;
      else break;
    }
  }
  function unescape(s) {
    return s.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[tbnrf"'\\])/g, (_, e) => {
      if (e[0] === 'u' || e[0] === 'U') return String.fromCodePoint(parseInt(e.slice(1), 16));
      return { t: '\t', b: '\b', n: '\n', r: '\r', f: '\f', '"': '"', "'": "'", '\\': '\\' }[e];
    });
  }
  function next() {
    skip();
    if (pos >= len) return null;
    const c = input[pos];
    const start = pos;
    if (c === '<') {
      const end = input.indexOf('>', pos);
      if (end < 0) error('unterminated IRI');
      pos = end + 1;
      return { t: 'iri', v: unescape(input.slice(start + 1, end)) };
    }
    if (c === '"' || c === "'") {
      const long = input.startsWith(c.repeat(3), pos);
      const q = long ? c.repeat(3) : c;
      pos += q.length;
      let out = '';
      while (true) {
        if (pos >= len) error('unterminated string');
        if (input[pos] === '\\') { out += input.slice(pos, pos + 2); pos += 2; continue; }
        if (input.startsWith(q, pos)) { pos += q.length; break; }
        if (!long && (input[pos] === '\n' || input[pos] === '\r')) error('newline in short string');
        out += input[pos++];
      }
      return { t: 'str', v: unescape(out) };
    }
    if (c === '@') {
      pos++;
      while (pos < len && /[A-Za-z0-9-]/.test(input[pos])) pos++;
      return { t: 'at', v: input.slice(start + 1, pos) };
    }
    if (c === '^' && input[pos + 1] === '^') { pos += 2; return { t: '^^' }; }
    if ('.;,[]()'.includes(c)) {
      // A '.' followed by a digit starts a decimal number, not a terminator.
      if (!(c === '.' && /[0-9]/.test(input[pos + 1] || ''))) { pos++; return { t: c }; }
    }
    if (/[+\-0-9.]/.test(c)) {
      const m = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?|\.[0-9]+(?:[eE][+-]?[0-9]+)?)/.exec(input.slice(pos, pos + 64));
      if (m && m[0] && m[0] !== '+' && m[0] !== '-') {
        let num = m[0];
        if (num.endsWith('.')) num = num.slice(0, -1); // "3." -> 3 then terminator
        pos += num.length;
        return { t: 'num', v: num };
      }
    }
    if (c === '_' && input[pos + 1] === ':') {
      pos += 2;
      while (pos < len && PN_CHARS.test(input[pos]) && input[pos] !== ':') pos++;
      while (input[pos - 1] === '.') pos--;
      return { t: 'bnode', v: input.slice(start + 2, pos) };
    }
    // Prefixed name, keyword (a, true, false, PREFIX, BASE).
    while (pos < len && PN_CHARS.test(input[pos])) {
      if (input[pos] === '\\') { pos += 2; continue; }
      pos++;
    }
    while (pos > start && input[pos - 1] === '.') pos--; // trailing '.' ends the statement
    if (pos === start) error(`unexpected character ${JSON.stringify(c)}`);
    return { t: 'name', v: input.slice(start, pos) };
  }
  return { next, error };
}

export function parseTurtleTriples(input) {
  const text = String(input ?? '');
  const lexer = turtleLexer(text);
  const triples = [];
  const prefixes = { rdf: RDF, skos: SKOS, skosxl: SKOSXL, xsd: XSD };
  let base = null;
  let blank = 0;
  let tok = lexer.next();
  const advance = () => { tok = lexer.next(); };
  const expect = (t) => { if (!tok || tok.t !== t) lexer.error(`expected "${t}"`); advance(); };
  const freshBlank = () => `_:g${++blank}`;
  const add = (s, p, o, kind, lang = null) => {
    triples.push([s, p, o, kind, lang]);
    if (triples.length > MAX_TRIPLES) throw new Error('Taxonomy file too large');
  };

  function name(v) {
    if (v === 'a') return RDF + 'type';
    const at = v.indexOf(':');
    if (at < 0) lexer.error(`unknown keyword ${v}`);
    const prefix = v.slice(0, at);
    if (!(prefix in prefixes)) throw new Error(`Turtle: unknown prefix "${prefix}:"`);
    return prefixes[prefix] + v.slice(at + 1).replace(/\\(.)/g, '$1');
  }
  function iriOf(t) {
    if (t.t === 'iri') return resolveIri(t.v, base);
    if (t.t === 'name') return name(t.v);
    lexer.error('expected an IRI');
  }
  // Returns [value, kind, lang].
  function object() {
    if (!tok) lexer.error('unexpected end');
    if (tok.t === 'iri' || (tok.t === 'name' && tok.v !== 'true' && tok.v !== 'false')) {
      const v = iriOf(tok); advance(); return [v, 'uri', null];
    }
    if (tok.t === 'bnode') { const v = `_:${tok.v}`; advance(); return [v, 'uri', null]; }
    if (tok.t === '[') { advance(); const node = freshBlank(); if (tok?.t !== ']') predicateObjectList(node); expect(']'); return [node, 'uri', null]; }
    if (tok.t === '(') {
      advance(); const node = freshBlank();
      while (tok && tok.t !== ')') object(); // list members are not used for SKOS
      expect(')'); return [node, 'uri', null];
    }
    if (tok.t === 'str') {
      const v = tok.v; advance();
      if (tok?.t === 'at') { const lang = tok.v.toLowerCase(); advance(); return [v, 'literal', lang]; }
      if (tok?.t === '^^') { advance(); iriOf(tok); advance(); }
      return [v, 'literal', null];
    }
    if (tok.t === 'num' || (tok.t === 'name' && (tok.v === 'true' || tok.v === 'false'))) {
      const v = tok.v; advance(); return [v, 'literal', null];
    }
    lexer.error('expected an object');
  }
  function predicateObjectList(subject) {
    while (true) {
      const predicate = iriOf(tok); advance();
      while (true) {
        const [o, kind, lang] = object();
        add(subject, predicate, o, kind, lang);
        if (tok?.t === ',') { advance(); continue; }
        break;
      }
      if (tok?.t !== ';') return;
      while (tok?.t === ';') advance();
      if (!tok || tok.t === '.' || tok.t === ']') return;
    }
  }

  while (tok) {
    if (tok.t === 'at' && (tok.v === 'prefix' || tok.v === 'base')) {
      const kind = tok.v; advance();
      if (kind === 'prefix') {
        if (tok?.t !== 'name' || !tok.v.endsWith(':')) lexer.error('expected a prefix name');
        const p = tok.v.slice(0, -1); advance();
        if (tok?.t !== 'iri') lexer.error('expected a prefix IRI');
        prefixes[p] = resolveIri(tok.v, base); advance();
      } else {
        if (tok?.t !== 'iri') lexer.error('expected a base IRI');
        base = resolveIri(tok.v, base); advance();
      }
      expect('.');
      continue;
    }
    if (tok.t === 'name' && /^(PREFIX|BASE)$/i.test(tok.v)) {
      const kind = tok.v.toUpperCase(); advance();
      if (kind === 'PREFIX') {
        if (tok?.t !== 'name' || !tok.v.endsWith(':')) lexer.error('expected a prefix name');
        const p = tok.v.slice(0, -1); advance();
        if (tok?.t !== 'iri') lexer.error('expected a prefix IRI');
        prefixes[p] = resolveIri(tok.v, base); advance();
      } else {
        if (tok?.t !== 'iri') lexer.error('expected a base IRI');
        base = resolveIri(tok.v, base); advance();
      }
      continue;
    }
    let subject;
    if (tok.t === '[') {
      advance(); subject = freshBlank();
      if (tok?.t !== ']') predicateObjectList(subject);
      expect(']');
      if (tok?.t === '.') { advance(); continue; }
    } else if (tok.t === 'bnode') { subject = `_:${tok.v}`; advance(); }
    else { subject = iriOf(tok); advance(); }
    predicateObjectList(subject);
    expect('.');
  }
  return triples;
}

// --------------------------------------------------------------- RDF/XML --

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e];
  });
}

// A small XML reader: elements, attributes, text, CDATA. DTDs and entity
// declarations are refused (XXE and entity expansion).
function parseXml(input) {
  const xml = String(input ?? '');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('External XML entities and DTDs are not allowed');
  const root = { children: [] };
  const stack = [root];
  let pos = 0;
  const attrRe = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  while (pos < xml.length) {
    const lt = xml.indexOf('<', pos);
    const textEnd = lt < 0 ? xml.length : lt;
    if (textEnd > pos) stack.at(-1).children.push({ text: decodeEntities(xml.slice(pos, textEnd)) });
    if (lt < 0) break;
    if (xml.startsWith('<!--', lt)) { const e = xml.indexOf('-->', lt); if (e < 0) throw new Error('XML: unterminated comment'); pos = e + 3; continue; }
    if (xml.startsWith('<![CDATA[', lt)) { const e = xml.indexOf(']]>', lt); if (e < 0) throw new Error('XML: unterminated CDATA'); stack.at(-1).children.push({ text: xml.slice(lt + 9, e) }); pos = e + 3; continue; }
    if (xml.startsWith('<?', lt)) { const e = xml.indexOf('?>', lt); if (e < 0) throw new Error('XML: unterminated declaration'); pos = e + 2; continue; }
    if (xml.startsWith('<!', lt)) throw new Error('XML: unsupported declaration');
    const gt = xml.indexOf('>', lt);
    if (gt < 0) throw new Error('XML: unterminated tag');
    const raw = xml.slice(lt + 1, gt);
    pos = gt + 1;
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      const open = stack.pop();
      if (!open || open.name !== name) throw new Error(`XML: mismatched </${name}>`);
      continue;
    }
    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const name = body.match(/^[^\s/>]+/)?.[0];
    if (!name) throw new Error('XML: bad tag');
    const attrs = {};
    for (const m of body.slice(name.length).matchAll(attrRe)) attrs[m[1]] = decodeEntities(m[3] ?? m[4]);
    const el = { name, attrs, children: [] };
    stack.at(-1).children.push(el);
    if (!selfClosing) stack.push(el);
  }
  if (stack.length !== 1) throw new Error(`XML: unclosed <${stack.at(-1).name}>`);
  return root;
}

export function parseRdfXmlTriples(input) {
  const doc = parseXml(input);
  const triples = [];
  let blank = 0;
  const add = (s, p, o, kind, lang = null) => {
    triples.push([s, p, o, kind, lang]);
    if (triples.length > MAX_TRIPLES) throw new Error('Taxonomy file too large');
  };
  // Expanded name using the namespaces in scope.
  const expand = (qname, ns, isAttr) => {
    const at = qname.indexOf(':');
    if (at < 0) return isAttr ? null : (ns[''] ?? '') + qname;
    const prefix = qname.slice(0, at);
    if (prefix === 'xml') return XML_NS + qname.slice(at + 1);
    if (!(prefix in ns)) throw new Error(`RDF/XML: undeclared prefix "${prefix}"`);
    return ns[prefix] + qname.slice(at + 1);
  };
  const scope = (el, ctx) => {
    const ns = { ...ctx.ns };
    let { base, lang } = ctx;
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k === 'xmlns') ns[''] = v;
      else if (k.startsWith('xmlns:')) ns[k.slice(6)] = v;
    }
    if (el.attrs['xml:base']) base = resolveIri(el.attrs['xml:base'], base);
    if (el.attrs['xml:lang'] !== undefined) lang = el.attrs['xml:lang'].toLowerCase() || null;
    return { ns, base, lang };
  };
  const rdfAttr = (el, ctx, local) => {
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k.startsWith('xmlns')) continue;
      if (expand(k, ctx.ns, true) === RDF + local) return v;
    }
    return undefined;
  };
  const elements = (el) => el.children.filter((c) => c.name);
  const textOf = (el) => el.children.map((c) => (c.name ? textOf(c) : c.text)).join('');

  function nodeElement(el, parentCtx) {
    const ctx = scope(el, parentCtx);
    const about = rdfAttr(el, ctx, 'about');
    const id = rdfAttr(el, ctx, 'ID');
    const nodeId = rdfAttr(el, ctx, 'nodeID');
    const subject = about !== undefined ? resolveIri(about, ctx.base)
      : id !== undefined ? resolveIri(`#${id}`, ctx.base)
      : nodeId !== undefined ? `_:${nodeId}` : `_:x${++blank}`;
    const type = expand(el.name, ctx.ns, false);
    if (type !== RDF + 'Description') add(subject, RDF + 'type', type, 'uri');
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k.startsWith('xmlns') || k.startsWith('xml:')) continue;
      const p = expand(k, ctx.ns, true);
      if (!p || p.startsWith(RDF)) { if (p === RDF + 'type') add(subject, RDF + 'type', resolveIri(v, ctx.base), 'uri'); continue; }
      add(subject, p, v, 'literal', ctx.lang);
    }
    for (const child of elements(el)) propertyElement(subject, child, ctx);
    return subject;
  }

  function propertyElement(subject, el, parentCtx) {
    const ctx = scope(el, parentCtx);
    const predicate = expand(el.name, ctx.ns, false);
    const resource = rdfAttr(el, ctx, 'resource');
    const nodeId = rdfAttr(el, ctx, 'nodeID');
    const parseType = rdfAttr(el, ctx, 'parseType');
    if (resource !== undefined) { add(subject, predicate, resolveIri(resource, ctx.base), 'uri'); return; }
    if (nodeId !== undefined) { add(subject, predicate, `_:${nodeId}`, 'uri'); return; }
    if (parseType === 'Resource') {
      const node = `_:x${++blank}`;
      add(subject, predicate, node, 'uri');
      for (const child of elements(el)) propertyElement(node, child, ctx);
      return;
    }
    if (parseType === 'Literal') { add(subject, predicate, textOf(el), 'literal', ctx.lang); return; }
    if (parseType === 'Collection') return; // lists are not used for SKOS
    const kids = elements(el);
    if (kids.length) { for (const kid of kids) add(subject, predicate, nodeElement(kid, ctx), 'uri'); return; }
    // Property attributes on an empty property element describe a blank node.
    const extra = Object.keys(el.attrs).filter((k) => !k.startsWith('xmlns') && !k.startsWith('xml:') && !expand(k, ctx.ns, true)?.startsWith(RDF));
    if (extra.length && !textOf(el).trim()) {
      const node = `_:x${++blank}`;
      add(subject, predicate, node, 'uri');
      for (const k of extra) add(node, expand(k, ctx.ns, true), el.attrs[k], 'literal', ctx.lang);
      return;
    }
    add(subject, predicate, textOf(el).trim(), 'literal', rdfAttr(el, ctx, 'datatype') ? null : ctx.lang);
  }

  const top = elements(doc);
  if (top.length !== 1) throw new Error('RDF/XML: expected one root element');
  const rootCtx = scope(top[0], { ns: {}, base: null, lang: null });
  if (expand(top[0].name, rootCtx.ns, false) === RDF + 'RDF') {
    for (const el of elements(top[0])) nodeElement(el, rootCtx);
  } else {
    nodeElement(top[0], { ns: {}, base: null, lang: null });
  }
  return triples;
}

// ------------------------------------------------------- SKOS extraction --

const langRank = (lang, preferred) => {
  if (!lang) return 1;
  if (lang === preferred) return 0;
  if (lang.split('-')[0] === preferred) return 0.5;
  return 2;
};

/**
 * Concepts from triples. Picks the preferred-language label (then untagged,
 * then any). Alt/hidden labels are kept in the preferred language or
 * untagged. A concept with several broader concepts keeps the first as its
 * parent (Term has one parent); the rest are reported as warnings.
 */
export function conceptsFromTriples(triples, { preferredLanguage = 'en' } = {}) {
  const preferred = preferredLanguage.toLowerCase();
  const warnings = [];
  const types = new Map();
  const props = new Map(); // subject -> [[p, o, kind, lang]]
  for (const [s, p, o, kind, lang] of triples) {
    if (p === RDF + 'type') { if (!types.has(s)) types.set(s, new Set()); types.get(s).add(o); }
    if (!props.has(s)) props.set(s, []);
    props.get(s).push([p, o, kind, lang]);
  }
  const values = (s, p) => (props.get(s) || []).filter((x) => x[0] === p);
  const isConcept = (s) => types.get(s)?.has(SKOS + 'Concept')
    || (!s.startsWith('_:') && (props.get(s) || []).some(([p]) => p === SKOS + 'prefLabel' || p === SKOSXL + 'prefLabel')
      && (props.get(s) || []).some(([p]) => [SKOS + 'broader', SKOS + 'narrower', SKOS + 'inScheme', SKOS + 'topConceptOf'].includes(p)));

  // Labels from SKOS and SKOS-XL (label resources with a literalForm).
  const labels = (s, kind) => {
    const out = values(s, SKOS + kind).filter((x) => x[2] === 'literal').map((x) => ({ text: x[1], lang: x[3] }));
    for (const [, node] of values(s, SKOSXL + kind)) {
      for (const [, text, k, lang] of values(node, SKOSXL + 'literalForm')) if (k === 'literal') out.push({ text, lang });
    }
    return out.map((l) => ({ ...l, text: String(l.text).trim() })).filter((l) => l.text);
  };
  const best = (list) => [...list].sort((a, b) => langRank(a.lang, preferred) - langRank(b.lang, preferred))[0]?.text ?? null;
  const inLanguage = (list) => list.filter((l) => langRank(l.lang, preferred) < 2).map((l) => l.text);

  const order = [];
  const seen = new Set();
  for (const [s] of triples) if (!seen.has(s)) { seen.add(s); if (isConcept(s)) order.push(s); }
  const ids = new Set(order);
  const schemes = [...types].filter(([, t]) => t.has(SKOS + 'ConceptScheme')).map(([s]) => s);

  const concepts = new Map();
  for (const s of order) {
    const pref = labels(s, 'prefLabel');
    const label = best(pref);
    if (!label) throw new Error(`Concept ${s} has no prefLabel`);
    const prefSet = new Set([label.toLowerCase()]);
    const unique = (list) => [...new Set(list)].filter((x) => !prefSet.has(x.toLowerCase()));
    concepts.set(s, {
      externalId: s,
      label,
      description: best(values(s, SKOS + 'definition').filter((x) => x[2] === 'literal').map((x) => ({ text: String(x[1]).trim(), lang: x[3] })).filter((x) => x.text)),
      synonyms: unique(inLanguage(labels(s, 'altLabel'))),
      hiddenLabels: unique(inLanguage(labels(s, 'hiddenLabel'))),
      parentExternalId: null,
      relatedExternalIds: [],
      schemeExternalId: values(s, SKOS + 'inScheme').find((x) => x[2] === 'uri')?.[1] ?? null,
    });
  }

  // Broader links in file order: skos:broader on the child, skos:narrower on the parent.
  const broader = new Map();
  for (const [s, p, o, kind] of triples) {
    if (kind !== 'uri') continue;
    let child = null, parent = null;
    if (p === SKOS + 'broader' && ids.has(s)) { child = s; parent = o; }
    if (p === SKOS + 'narrower' && ids.has(o)) { child = o; parent = s; }
    if (!child) continue;
    if (!broader.has(child)) broader.set(child, []);
    if (!broader.get(child).includes(parent)) broader.get(child).push(parent);
  }
  for (const [child, parents] of broader) {
    const known = parents.filter((p) => ids.has(p));
    if (known.length < parents.length) {
      warnings.push(`"${concepts.get(child).label}" has a broader concept that isn't in the file (${parents.find((p) => !ids.has(p))}); it is imported at the top level`);
    }
    if (known.length > 1) warnings.push(`"${concepts.get(child).label}" has ${known.length} broader concepts; kept the first, "${concepts.get(known[0]).label}"`);
    concepts.get(child).parentExternalId = known[0] ?? null;
  }
  for (const c of concepts.values()) {
    const visited = new Set();
    for (let p = c; p; p = p.parentExternalId ? concepts.get(p.parentExternalId) : null) {
      if (visited.has(p.externalId)) throw new Error(`Cycle at ${p.externalId}`);
      visited.add(p.externalId);
    }
  }
  for (const [s, p, o, kind] of triples) {
    if (p !== SKOS + 'related' || kind !== 'uri' || !ids.has(s) || !ids.has(o) || s === o) continue;
    const list = concepts.get(s).relatedExternalIds;
    if (!list.includes(o)) list.push(o);
  }
  const schemeLabel = schemes.length ? best(labels(schemes[0], 'prefLabel')) || best(values(schemes[0], 'http://purl.org/dc/terms/title').map((x) => ({ text: x[1], lang: x[3] }))) : null;
  return { concepts: [...concepts.values()], schemes, schemeLabel, warnings, readOnly: true };
}

export function parseSkosTurtle(input, options) {
  return { format: 'skos_ttl', ...conceptsFromTriples(parseTurtleTriples(input), options) };
}

export function parseSkosRdfXml(input, options) {
  return { format: 'skos_rdfxml', ...conceptsFromTriples(parseRdfXmlTriples(input), options) };
}
