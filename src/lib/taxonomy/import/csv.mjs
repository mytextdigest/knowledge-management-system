import { cleanLabel, normalizeLabel } from '../labels.mjs';

// RFC 4180-compatible CSV reader (quoted commas, escaped quotes and multiline cells).
export function readCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      if (field !== '') throw new Error(`Unexpected quote at offset ${i}`);
      quoted = true;
    } else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const pick = (record, ...names) => names.map(n => record[n]).find(v => v !== undefined && String(v).trim() !== '');
const list = (s) => String(s ?? '').split(/[|;]/).map(v => v.trim()).filter(Boolean);

/**
 * Pure import preview. No database writes. Supports externalId/id, label/prefLabel,
 * parentId/parentExternalId or a `path` column (delimiter `>`), and synonyms.
 * Returns normalized concept records with stable IDs, suitable for diffing.
 */
export function parseTaxonomyCsv(text) {
  const [head, ...data] = readCsv(text);
  if (!head) throw new Error('CSV is empty');
  const columns = head.map(v => v.trim().toLowerCase().replace(/[\s_-]/g, ''));
  if (new Set(columns).size !== columns.length) throw new Error('Duplicate CSV header');
  if (!columns.includes('path') && !columns.some(x => ['label','preflabel','name'].includes(x))) {
    throw new Error('CSV requires path or label column');
  }
  const concepts = new Map();
  const add = (item, line) => {
    if (!item.externalId || !item.label) throw new Error(`Row ${line}: missing id or label`);
    if (concepts.has(item.externalId)) {
      const prior = concepts.get(item.externalId);
      if (prior.label !== item.label || prior.parentExternalId !== item.parentExternalId) throw new Error(`Row ${line}: conflicting concept ${item.externalId}`);
      prior.synonyms = [...new Set([...prior.synonyms, ...item.synonyms])];
    } else concepts.set(item.externalId, item);
  };
  for (const [i, cells] of data.entries()) {
    if (cells.length !== columns.length) throw new Error(`Row ${i + 2}: expected ${columns.length} columns, got ${cells.length}`);
    const rec = Object.fromEntries(columns.map((c, j) => [c, cells[j].trim()]));
    const path = pick(rec, 'path');
    const synonyms = list(pick(rec, 'synonyms', 'altlabel', 'altlabels'));
    const hiddenLabels = list(pick(rec, 'hiddenlabel', 'hiddenlabels'));
    if (path) {
      const segments = path.split('>').map(v => cleanLabel(v)).filter(Boolean);
      if (!segments.length) throw new Error(`Row ${i + 2}: invalid path`);
      let parentExternalId = null;
      for (const [j, label] of segments.entries()) {
        const externalId = `csv:path:${segments.slice(0, j + 1).map(normalizeLabel).join('>')}`;
        add({ externalId, label, parentExternalId, description: j === segments.length - 1 ? (pick(rec, 'definition', 'description') || null) : null,
          synonyms: j === segments.length - 1 ? synonyms : [], hiddenLabels: j === segments.length - 1 ? hiddenLabels : [] }, i + 2);
        parentExternalId = externalId;
      }
    } else {
      const label = cleanLabel(pick(rec, 'label', 'preflabel', 'name'));
      const externalId = String(pick(rec, 'externalid', 'id') || '').trim();
      if (!externalId) throw new Error(`Row ${i + 2}: stable externalId/id required for parent-based CSV`);
      add({ externalId, label, parentExternalId: pick(rec, 'parentexternalid', 'parentid', 'parent') || null,
        description: pick(rec, 'definition', 'description') || null, synonyms, hiddenLabels }, i + 2);
    }
  }
  for (const item of concepts.values()) {
    if (item.parentExternalId && !concepts.has(item.parentExternalId)) throw new Error(`Missing parent ${item.parentExternalId} for ${item.externalId}`);
    const visited = new Set([item.externalId]); let p = item.parentExternalId;
    while (p) { if (visited.has(p)) throw new Error(`Cycle involving ${item.externalId}`); visited.add(p); p = concepts.get(p)?.parentExternalId; }
  }
  return { format: 'csv', concepts: [...concepts.values()] };
}
