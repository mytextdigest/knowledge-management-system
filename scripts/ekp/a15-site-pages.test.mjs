// A-15: SharePoint site pages → text (src/lib/connectors/sharepointPages.js).
// The canvas shape is from the NGI Engineering test page (Graph sitePage
// with $expand=canvasLayout).
// Run: npm run ekp:a15:test
import test from "node:test";
import assert from "node:assert/strict";
import { htmlToText, isPageItem, pageToText } from "../../src/lib/connectors/sharepointPages.js";
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
  assert.equal(canStreamFromSource({ sourceProvider: "sharepoint", contentType: "page", externalId: "i", externalContainerId: "d" }), false);
});
