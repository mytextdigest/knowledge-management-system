// Builds a single, formatting-preserving representation of every section in
// the document Summary tab (Document Info, Sheets Breakdown, Overview, Key Points)
// so Copy/Print act on all of them together instead of one section at a time.

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildSummaryHtml(summary, { sheets = [], isSpreadsheet = false } = {}) {
  if (!summary) return "";

  const infoRows = [
    ["Type", summary.documentType],
    ["Words", summary.wordCount],
    ["Read Time", summary.estimatedReadTime ? `${summary.estimatedReadTime} min` : null],
    ["Modified", summary.lastModified],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  const sections = [];

  sections.push(`
    <section>
      <h2>Document Information</h2>
      <table>
        ${infoRows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}
      </table>
    </section>
  `);

  if (isSpreadsheet && sheets.length > 0) {
    sections.push(`
      <section>
        <h2>Sheets (${sheets.length})</h2>
        ${sheets.map((sheet) => `
          <div class="sheet">
            <h3>${escapeHtml(sheet.sheetName)}${sheet.rowSpan ? ` <span class="muted">(Rows ${escapeHtml(sheet.rowSpan)})</span>` : ""}</h3>
            ${sheet.columnHeaders?.length ? `<p class="muted">Columns: ${escapeHtml(sheet.columnHeaders.join(", "))}</p>` : ""}
          </div>
        `).join("")}
      </section>
    `);
  }

  sections.push(`
    <section>
      <h2>Summary</h2>
      <p>${escapeHtml(summary.overview)}</p>
    </section>
  `);

  if (summary.keyPoints?.length > 0) {
    sections.push(`
      <section>
        <h2>Key Points</h2>
        <ul>
          ${summary.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
        </ul>
      </section>
    `);
  }

  return `
    <article>
      <h1>${escapeHtml(summary.title || "Document Summary")}</h1>
      ${sections.join("\n")}
    </article>
  `;
}

export function buildSummaryText(summary, { sheets = [], isSpreadsheet = false } = {}) {
  if (!summary) return "";

  const lines = [summary.title || "Document Summary", ""];

  lines.push("DOCUMENT INFORMATION");
  if (summary.documentType) lines.push(`Type: ${summary.documentType}`);
  if (summary.wordCount !== undefined) lines.push(`Words: ${summary.wordCount}`);
  if (summary.estimatedReadTime !== undefined) lines.push(`Read Time: ${summary.estimatedReadTime} min`);
  if (summary.lastModified) lines.push(`Modified: ${summary.lastModified}`);
  lines.push("");

  if (isSpreadsheet && sheets.length > 0) {
    lines.push(`SHEETS (${sheets.length})`);
    sheets.forEach((sheet) => {
      lines.push(`- ${sheet.sheetName}${sheet.rowSpan ? ` (Rows ${sheet.rowSpan})` : ""}`);
      if (sheet.columnHeaders?.length) lines.push(`  Columns: ${sheet.columnHeaders.join(", ")}`);
    });
    lines.push("");
  }

  lines.push("SUMMARY");
  lines.push(summary.overview || "");
  lines.push("");

  if (summary.keyPoints?.length > 0) {
    lines.push("KEY POINTS");
    summary.keyPoints.forEach((point) => lines.push(`- ${point}`));
  }

  return lines.join("\n").trim();
}

export async function copySummary(summary, options) {
  const html = buildSummaryHtml(summary, options);
  const text = buildSummaryText(summary, options);

  try {
    if (typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    }
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error("Copy failed:", err);
    try {
      await navigator.clipboard.writeText(text);
    } catch (fallbackErr) {
      console.error("Copy fallback failed:", fallbackErr);
    }
  }
}

export function printSummary(summary, options) {
  const html = buildSummaryHtml(summary, options);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const logoUrl = `${window.location.origin}/logo.png`;

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(summary?.title || "Document Summary")}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 32px; line-height: 1.6; color: #111; }
          .brand { display: flex; align-items: center; gap: 10px; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 2px solid #111; }
          .brand img { width: 36px; height: 36px; object-fit: contain; }
          .brand-name { font-size: 16px; font-weight: 700; line-height: 1; }
          .brand-tagline { font-size: 9px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #555; }
          h1 { font-size: 22px; margin-bottom: 16px; }
          h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          h3 { font-size: 14px; margin: 12px 0 4px; }
          p { margin: 0 0 8px; }
          ul { margin: 0; padding-left: 20px; }
          li { margin-bottom: 6px; }
          table { border-collapse: collapse; }
          td { padding: 2px 12px 2px 0; font-size: 14px; }
          td:first-child { color: #555; }
          .muted { color: #666; font-size: 12px; }
          .sheet { margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="brand">
          <img src="${logoUrl}" alt="KMS Logo" />
          <div>
            <div class="brand-name">KMS</div>
            <div class="brand-tagline">Document Intelligence</div>
          </div>
        </div>
        ${html}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
