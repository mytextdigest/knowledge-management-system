// E-3 / A-23 (PRS E16.5): SharePoint managed-metadata values kept on synced
// documents (src/lib/connectors/sharepointSourceTags.js).
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { columnInfo, createSourceTagReader, sourceTagWrites, taxonomyValues } from "../../src/lib/connectors/sharepointSourceTags.js";

const G1 = "11111111-1111-1111-1111-111111111111";
const G2 = "22222222-2222-2222-2222-222222222222";
const G3 = "3333333A-3333-3333-3333-333333333333";
const SET = "AAAAAAAA-0000-0000-0000-000000000001";

// Shape of Graph's /drives/{d}/items/{i}/listItem?$expand=fields for a file
// with a single-value and a multi-value managed-metadata column.
const FIELDS = {
  "@odata.etag": "\"1\"",
  FileLeafRef: "Outage Review.pptx",
  Title: "Outage Review",
  Department: { Label: "Generation", TermGuid: G1, WssId: 3 },
  Topics: [
    { Label: "Hydro", TermGuid: G2, WssId: 4 },
    { Label: "Safety", TermGuid: G3, WssId: 5 },
    { Label: "Hydro", TermGuid: G2, WssId: 4 }, // duplicate value
  ],
  Department_0: `Generation|${G1}`, // hidden note field of Department
  TaxCatchAll: [{ ID: 3, Term: "Generation" }],
  Modified: "2026-11-04T10:00:00Z",
  Author: { LookupId: 7, LookupValue: "Simran" },
};
const COLUMNS = [
  { name: "Department", displayName: "Department", term: { allowMultipleValues: false, termSet: { id: SET } } },
  { name: "Topics", displayName: "NYPA Topics", term: { allowMultipleValues: true } },
  { name: "Title", displayName: "Title", text: {} },
];

test("one row per managed-metadata value, several columns and multi-value; guids lower-cased", () => {
  const rows = taxonomyValues(FIELDS, columnInfo(COLUMNS));
  assert.deepEqual(rows, [
    { fieldName: "Department", fieldDisplayName: "Department", label: "Generation", termGuid: G1, termSetGuid: SET.toLowerCase() },
    { fieldName: "Topics", fieldDisplayName: "NYPA Topics", label: "Hydro", termGuid: G2, termSetGuid: null },
    { fieldName: "Topics", fieldDisplayName: "NYPA Topics", label: "Safety", termGuid: G3.toLowerCase(), termSetGuid: null },
  ]);
});

test("ordinary fields, lookups, TaxCatchAll and empty values give no rows", () => {
  assert.deepEqual(taxonomyValues({ Title: "x", Author: { LookupId: 1, LookupValue: "a" }, TaxCatchAll: [{ TermGuid: G1, Label: "x" }] }), []);
  assert.deepEqual(taxonomyValues({ Department: { Label: "", TermGuid: G1 } }), []);
  assert.deepEqual(taxonomyValues({ Department: { Label: "Gone", TermGuid: "00000000-0000-0000-0000-000000000000" } }), []);
  assert.deepEqual(taxonomyValues({ Topics: [] }), []);
  assert.deepEqual(taxonomyValues(null), []);
});

test("hidden note field is used when the column's object form is missing", () => {
  const rows = taxonomyValues({ Topics_0: `Hydro|${G2};Safety|${G3}`, Comments: "a|b" }, columnInfo(COLUMNS));
  assert.deepEqual(rows.map((r) => [r.fieldName, r.fieldDisplayName, r.label, r.termGuid]), [
    ["Topics", "NYPA Topics", "Hydro", G2],
    ["Topics", "NYPA Topics", "Safety", G3.toLowerCase()],
  ]);
});

function fakeDb() {
  const calls = [];
  const db = {
    calls,
    documentSourceTag: {
      deleteMany: (args) => (calls.push(["deleteMany", args]), "delete"),
      upsert: (args) => (calls.push(["upsert", args]), "upsert"),
    },
    $transaction: async (ops) => (calls.push(["tx", ops.length]), ops),
  };
  return db;
}

test("writes replace the document's tags: values no longer on the item are deleted", () => {
  const db = fakeDb();
  const now = new Date("2026-11-04T12:00:00Z");
  const rows = taxonomyValues(FIELDS, columnInfo(COLUMNS));
  const ops = sourceTagWrites(db, "doc1", rows, now);
  assert.equal(ops.length, 4);
  const [, del] = db.calls[0];
  assert.deepEqual(del.where, {
    documentId: "doc1",
    sourceSystem: "sharepoint",
    NOT: { OR: rows.map((r) => ({ fieldName: r.fieldName, termGuid: r.termGuid })) },
  });
  const [, up] = db.calls[1];
  assert.deepEqual(up.where, { documentId_fieldName_termGuid: { documentId: "doc1", fieldName: "Department", termGuid: G1 } });
  assert.equal(up.create.sourceSystem, "sharepoint");
  assert.equal(up.update.syncedAt, now);
});

test("a file whose tags were all removed in SharePoint loses every row", () => {
  const db = fakeDb();
  sourceTagWrites(db, "doc1", []);
  assert.deepEqual(db.calls, [["deleteMany", { where: { documentId: "doc1", sourceSystem: "sharepoint" } }]]);
});

test("reader: columns read once per library, item gone → null, column failure isn't fatal", async () => {
  const db = fakeDb();
  let columnCalls = 0;
  const reader = createSourceTagReader(db, {
    accessToken: "t",
    deps: {
      listDriveColumns: async ({ driveId }) => {
        columnCalls++;
        if (driveId === "broken") throw new Error("403");
        return COLUMNS;
      },
      getDriveItemFields: async ({ itemId }) => (itemId === "gone" ? null : FIELDS),
    },
  });
  assert.equal(await reader.sync({ documentId: "d1", driveId: "drv", itemId: "i1" }), 3);
  assert.equal(await reader.sync({ documentId: "d2", driveId: "drv", itemId: "i2" }), 3);
  assert.equal(columnCalls, 1);
  assert.equal(await reader.sync({ documentId: "d3", driveId: "drv", itemId: "gone" }), null);
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await reader.sync({ documentId: "d4", driveId: "broken", itemId: "i4" }), 3); // values kept, no display names
  } finally {
    console.warn = original;
  }
});

test("worker reads tags for every written file and backfills each site once", () => {
  const worker = readFileSync(new URL("../../worker/index.js", import.meta.url), "utf8");
  assert.match(worker, /createSourceTagReader\(prisma/);
  assert.match(worker, /tagReader\.sync\(\{ documentId: result\.docId/);
  assert.match(worker, /backfillSourceTags\(/);
  assert.match(worker, /sourceTagsReadAt,/);
  // every syncOneFile branch that writes a document reports its id
  assert.equal((worker.match(/return \{ skipped: false, docId: doc\.id \}/g) || []).length, 2);
  assert.match(worker, /return \{ skipped: false, tooLarge: true, docId \}/);
});

test("document API returns the tags and the page shows them", () => {
  const api = readFileSync(new URL("../../src/app/api/documents/[id]/route.js", import.meta.url), "utf8");
  assert.match(api, /sourceTags: \{/);
  const page = readFileSync(new URL("../../src/app/(app)/document/page.jsx", import.meta.url), "utf8");
  assert.match(page, /<SourceTagsPanel tags=\{doc\?\.sourceTags\} \/>/);
});
