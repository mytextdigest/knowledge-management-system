// A-15: SharePoint site pages → text (src/lib/connectors/sharepointPages.js).
// The canvas shape is from the NGI Engineering test page (Graph sitePage
// with $expand=canvasLayout).
// Run: npm run ekp:a15:test
import test from "node:test";
import assert from "node:assert/strict";
import { classicPageText, htmlToText, isPageItem, pageLibrariesOf, pageToText } from "../../src/lib/connectors/sharepointPages.js";
import { canStreamFromSource } from "../../src/lib/documentSource.js";

test("htmlToText keeps paragraphs and lists, drops tags and scripts, decodes entities", () => {
  const html = "<h2>Runbook</h2><p>Step&nbsp;one &amp; two</p><ul><li>Page &lt;oncall&gt;</li><li>Escalate &#8211; 15&#x27;</li></ul><script>alert(1)</script>";
  assert.equal(htmlToText(html), "Runbook\nStep one & two\n- Page <oncall>\n- Escalate – 15'");
});

test("pageToText: title, description, text web parts and searchable texts; banner title not repeated", () => {
  const page = {
    title: "KMS Test Page – Everyone",
    description: "Who to call",
    canvasLayout: {
      horizontalSections: [
        {
          columns: [
            {
              webparts: [
                { "@odata.type": "#microsoft.graph.standardWebPart", data: { title: "Banner", properties: { title: "KMS Test Page – Everyone" }, serverProcessedContent: { searchablePlainTexts: [] } } },
                { "@odata.type": "#microsoft.graph.textWebPart", innerHtml: "<p>The on-call rotation is weekly.</p>" },
              ],
            },
            { webparts: [{ data: { title: "Quick links", properties: { title: "Links" }, serverProcessedContent: { searchablePlainTexts: [{ key: "x", value: "Pager duty" }] } } }] },
          ],
        },
      ],
      verticalSection: { webparts: [{ innerHtml: "<p>Contact: ops@contoso.com</p>" }] },
    },
  };
  assert.equal(
    pageToText(page),
    "KMS Test Page – Everyone\n\nWho to call\n\nThe on-call rotation is weekly.\n\nLinks\n\nPager duty\n\nContact: ops@contoso.com"
  );
  assert.equal(pageToText({ title: "Empty" }), "Empty");
});

test("only .aspx files outside Templates are pages; pages are never streamed as files", () => {
  assert.equal(isPageItem({ name: "Home.aspx", file: {}, parentReference: { path: "/drives/x/root:" } }), true);
  assert.equal(isPageItem({ name: "Tpl.aspx", file: {}, parentReference: { path: "/drives/x/root:/Templates" } }), false);
  assert.equal(isPageItem({ name: "Templates", folder: {} }), false);
  assert.equal(isPageItem({ name: "logo.png", file: {} }), false);
  assert.equal(canStreamFromSource({ sourceProvider: "sharepoint", contentType: "page", externalId: "i", externalUrl: "https://x/SitePages/a.aspx" }), false);
});

test("classic pages: wiki and publishing bodies, with title and description", () => {
  assert.equal(
    classicPageText({ Title: "KMS Classic Wiki Test", WikiField: '<div class="ExternalClass1"><p>Release <b>checklist</b></p><p>Run the smoke tests.</p></div>' }),
    "KMS Classic Wiki Test\n\nRelease checklist\nRun the smoke tests."
  );
  assert.equal(
    classicPageText({ Title: "Policy", Comments: "HR policy page", PublishingPageContent: "<p>Leave &amp; holidays</p>" }),
    "Policy\n\nHR policy page\n\nLeave & holidays"
  );
  assert.equal(classicPageText({ Title: "Only a title" }), "Only a title");
  assert.equal(classicPageText(null), "");
});

test("page libraries: read the single-library keys of earlier syncs", () => {
  assert.deepEqual(pageLibrariesOf({ pagesDriveId: "p1", pagesCursor: "c1" }), [{ listId: null, driveId: "p1", template: 119, cursor: "c1" }]);
  const libs = [{ listId: "l", driveId: "p2", template: 850, cursor: null }];
  assert.deepEqual(pageLibrariesOf({ pageLibraries: libs, pagesDriveId: "old" }), libs);
  assert.deepEqual(pageLibrariesOf({}), []);
});
