// A-14: no-copy mode settings and source streaming rules
// (src/lib/connectors/sharepointSettings.js, src/lib/documentSource.js).
// Run: npm run ekp:a14:test
import test from "node:test";
import assert from "node:assert/strict";
import {
  pickSharePointSettings,
  sharePointSettings,
  validateSharePointSettingsPatch,
} from "../../src/lib/connectors/sharepointSettings.js";
import { canStreamFromSource, sourcePreviewUrl } from "../../src/lib/documentSource.js";
import { resolveDriveId, siteForUrl } from "../../src/lib/connectors/sharepointLocate.js";

test("settings: absent means today's behaviour (keep copies, include pages)", () => {
  assert.deepEqual(sharePointSettings({ sites: [] }), { storeOriginals: true, syncPages: true, maxFileSizeMb: 200 });
  assert.deepEqual(sharePointSettings(null), { storeOriginals: true, syncPages: true, maxFileSizeMb: 200 });
  assert.deepEqual(sharePointSettings({ storeOriginals: false, syncPages: false }), { storeOriginals: false, syncPages: false, maxFileSizeMb: 200 });
});

test("settings patch: booleans only, only known keys, something to change", () => {
  assert.deepEqual(validateSharePointSettingsPatch({ storeOriginals: false }), { data: { storeOriginals: false } });
  assert.ok(validateSharePointSettingsPatch({ storeOriginals: "no" }).error);
  assert.ok(validateSharePointSettingsPatch({ tenantId: "x" }).error, "can't overwrite connection fields");
  assert.ok(validateSharePointSettingsPatch({}).error);
});

test("settings survive a re-confirm of sites", () => {
  assert.deepEqual(pickSharePointSettings({ tenantId: "t", sites: [], storeOriginals: false }), { storeOriginals: false });
  assert.deepEqual(pickSharePointSettings(undefined), {});
});

test("streaming: only SharePoint documents with no stored copy and a known location", () => {
  const sp = { sourceProvider: "sharepoint", externalId: "i", externalUrl: "https://contoso.sharepoint.com/sites/Eng/a.docx", filePath: null };
  assert.equal(canStreamFromSource(sp), true);
  assert.equal(canStreamFromSource({ ...sp, filePath: "uploads/x" }), false, "a stored copy is served from S3");
  assert.equal(canStreamFromSource({ ...sp, externalUrl: null }), false, "no link: its site can't be found");
  assert.equal(canStreamFromSource({ ...sp, sourceProvider: "manual" }), false);
  assert.equal(sourcePreviewUrl("doc1", { download: true }), "/api/documents/doc1/preview?download=1");
});

test("a document's site comes from its URL: longest connected site, at a path boundary", async () => {
  const sites = [
    { siteId: "root", siteUrl: "https://contoso.sharepoint.com", driveId: "d-root" },
    { siteId: "eng", siteUrl: "https://contoso.sharepoint.com/sites/Eng/", driveId: "d-eng", pagesDriveId: "p-eng" },
    { siteId: "engineering", siteUrl: "https://contoso.sharepoint.com/sites/Engineering", driveId: "d-engineering" },
  ];
  const at = (url) => siteForUrl(sites, url)?.siteId ?? null;
  assert.equal(at("https://contoso.sharepoint.com/sites/Engineering/_layouts/15/Doc.aspx?sourcedoc=%7BX%7D"), "engineering");
  assert.equal(at("https://contoso.sharepoint.com/sites/Eng/Shared%20Documents/a.pdf"), "eng");
  assert.equal(at("https://CONTOSO.sharepoint.com/sites/eng"), "eng", "case-insensitive");
  assert.equal(at("https://contoso.sharepoint.com/Shared%20Documents/b.pdf"), "root");
  assert.equal(at("https://fabrikam.sharepoint.com/sites/Eng/a.pdf"), null);
  assert.equal(at(null), null);

  const scopeConfig = { tenantId: "t", sites };
  assert.equal(await resolveDriveId({ externalUrl: "https://contoso.sharepoint.com/sites/Eng/a.pdf" }, { scopeConfig }), "d-eng");
  assert.equal(await resolveDriveId({ contentType: "page", externalUrl: "https://contoso.sharepoint.com/sites/Eng/SitePages/Home.aspx" }, { scopeConfig }), null, "pages have no file");
  assert.equal(await resolveDriveId({ externalUrl: "https://fabrikam.sharepoint.com/x" }, { scopeConfig }), null);
});
