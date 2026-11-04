// EKP A-23 (Workstream E, E-3; PRS E16.5): keep the managed-metadata values
// a SharePoint file already has (Semaphore tags at NYPA, Q&A #128, #234).
//
// During sync each file's list-item fields are read
// (/drives/{d}/items/{i}/listItem?$expand=fields) and every managed-metadata
// value is stored raw as a DocumentSourceTag row: one row per value, so
// several taxonomy columns and multi-value columns all fit. A value removed
// in SharePoint is removed on the next sync of the file. Workstream C maps
// the rows to its terms by termGuid (C-8); nothing here knows about terms.
//
// Graph returns a managed-metadata column as { Label, TermGuid, WssId }, or
// an array of them for a multi-value column. Each column also has a hidden
// note field ("<Name>_0" or a generated name) holding "Label|guid;Label|guid",
// used when the object form is missing.
//
// Imported by the worker, so relative imports only.

import { getDriveItemFields, listDriveColumns } from "../msGraph.js";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";
const NOTE_VALUE = /^[^|;]+\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(;[^|;]+\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*$/i;
// System lookups that carry term ids but aren't columns a user tagged with.
const IGNORED_FIELDS = new Set(["TaxCatchAll", "TaxCatchAllLabel"]);

const pick = (obj, name) => obj[name] ?? obj[name[0].toLowerCase() + name.slice(1)];

function termValue(value) {
  if (!value || typeof value !== "object") return null;
  const termGuid = String(pick(value, "TermGuid") || "").toLowerCase();
  const label = String(pick(value, "Label") || "").trim();
  if (!GUID.test(termGuid) || termGuid === EMPTY_GUID || !label) return null;
  return { label, termGuid };
}

/** column name → { displayName, termSetGuid } from Graph column definitions. */
export function columnInfo(columns = []) {
  const info = new Map();
  for (const c of columns) {
    if (!c?.name) continue;
    const termSetGuid = c.term?.termSet?.id || c.term?.termSetId || null;
    info.set(c.name, { displayName: c.displayName || null, termSetGuid: termSetGuid ? String(termSetGuid).toLowerCase() : null, isTerm: Boolean(c.term) });
  }
  return info;
}

/**
 * Managed-metadata values of one list item's fields:
 * [{ fieldName, fieldDisplayName, label, termGuid, termSetGuid }], unique by (fieldName, termGuid).
 */
export function taxonomyValues(fields = {}, columns = new Map()) {
  const rows = new Map();
  const add = (fieldName, value) => {
    const key = `${fieldName}\u0000${value.termGuid}`;
    if (rows.has(key)) return;
    const col = columns.get(fieldName);
    rows.set(key, { fieldName, fieldDisplayName: col?.displayName || null, label: value.label, termGuid: value.termGuid, termSetGuid: col?.termSetGuid || null });
  };

  const seen = new Set();
  for (const [name, raw] of Object.entries(fields || {})) {
    if (IGNORED_FIELDS.has(name) || name.startsWith("@")) continue;
    const values = (Array.isArray(raw) ? raw : [raw]).map(termValue).filter(Boolean);
    if (!values.length) continue;
    seen.add(name);
    values.forEach((v) => add(name, v));
  }

  // Fallback: hidden note fields ("Label|guid;…") of columns not seen above.
  for (const [name, raw] of Object.entries(fields || {})) {
    if (typeof raw !== "string" || !NOTE_VALUE.test(raw.trim())) continue;
    const base = name.replace(/_0$/, "");
    const owner = columns.has(base) || base in fields ? base : name;
    if (seen.has(owner)) continue;
    for (const pair of raw.trim().split(";")) {
      const [label, guid] = pair.split("|");
      const value = termValue({ Label: label, TermGuid: guid });
      if (value) add(owner, value);
    }
  }
  return [...rows.values()];
}

/**
 * Replace one document's SharePoint tags with `rows` (deletes values no
 * longer on the item). Returns the writes for one transaction.
 */
export function sourceTagWrites(db, documentId, rows, now = new Date()) {
  const keep = rows.map((r) => ({ fieldName: r.fieldName, termGuid: r.termGuid }));
  return [
    db.documentSourceTag.deleteMany({
      where: { documentId, sourceSystem: "sharepoint", ...(keep.length ? { NOT: { OR: keep } } : {}) },
    }),
    ...rows.map((r) =>
      db.documentSourceTag.upsert({
        where: { documentId_fieldName_termGuid: { documentId, fieldName: r.fieldName, termGuid: r.termGuid } },
        create: { documentId, sourceSystem: "sharepoint", ...r, syncedAt: now },
        update: { fieldDisplayName: r.fieldDisplayName, label: r.label, termSetGuid: r.termSetGuid, syncedAt: now },
      })
    ),
  ];
}

/**
 * Per-sync-run reader: caches each library's columns, reads an item's
 * fields and stores its tags. `deps` replaces the Graph calls in tests.
 */
export function createSourceTagReader(db, { accessToken, deps = {} }) {
  const graph = { getDriveItemFields, listDriveColumns, ...deps };
  const columnsByDrive = new Map();
  const columnsOf = (driveId) => {
    if (!columnsByDrive.has(driveId)) {
      columnsByDrive.set(
        driveId,
        graph.listDriveColumns({ accessToken, driveId }).then(columnInfo, (err) => {
          // Display names and term-set ids are nice to have; the values aren't lost without them.
          console.warn(`⚠️ Couldn't read the columns of drive ${driveId}:`, err.message);
          return new Map();
        })
      );
    }
    return columnsByDrive.get(driveId);
  };

  return {
    /** Store one document's tags. Returns the number of values, or null if the item is gone. */
    async sync({ documentId, driveId, itemId }) {
      const fields = await graph.getDriveItemFields({ accessToken, driveId, itemId });
      if (fields === null) return null;
      const rows = taxonomyValues(fields, await columnsOf(driveId));
      await db.$transaction(sourceTagWrites(db, documentId, rows));
      return rows.length;
    },
  };
}
