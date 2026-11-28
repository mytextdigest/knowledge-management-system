# Power BI reporting (D-11)
Create a reporting key as super admin in Settings → Integrations → Power BI reporting. Store the one-time value securely. Revoke it when no longer needed. Never publish a PBIX containing a live key.

Use HTTPS, Get Data → Web, anonymous connection with an Authorization header `Bearer <key>`. Example Power Query (replace placeholders; keep credentials in an approved secret mechanism):

```powerquery
let
  Data = Json.Document(Web.Contents("https://YOUR-KMS-HOST", [RelativePath="api/reporting/v1/metrics", Query=[from="2026-11-01",to="2026-11-30",page="1",pageSize="100"], Headers=[Authorization="Bearer " & ReportingKey]])),
  Table = Table.FromRecords(Data)
in Table
```

Datasets: metrics (daily rollups), searches (daily counts by kind, no user or query text), documents (metadata only), health (document health flags). All accept from/to inclusive UTC dates, page/pageSize (maximum 500), format=json or csv. JSON is a flat array; increment page until fewer than pageSize rows (or empty). X-Next-Page is provided. Documents and health filter by creation date. Metrics may lag until the rollup runs. Reporting keys have organization-wide admin metadata scope, not individual user scope. No content or raw queries are exported. Use daily metric charts, search counts by kind and health flags in a starter report. Configure refresh in Power BI Service with approved credential handling; actual Desktop and Service refresh are pending validation.
