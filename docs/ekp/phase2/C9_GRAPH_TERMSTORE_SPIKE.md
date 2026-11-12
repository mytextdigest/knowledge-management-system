# C-9 — Microsoft Graph term-store investigation (November 13)

Status: **research plan only; live tenant access not available in the supplied source snapshot**. Do not mark the tenant spike completed without evidence.

## Proposed tenant-safe checks

1. Verify Graph permissions granted to the existing SharePoint integration. Reading taxonomy may require `TermStore.Read.All` (application or delegated, with tenant admin consent); check Microsoft Graph documentation and the tenant's actual consent before requesting access.
2. Use a dedicated test tenant and least-privilege token. Test `GET /v1.0/sites/{site-id}/termStore/sets` and `GET /v1.0/sites/{site-id}/termStore/sets/{set-id}/terms` with paging, without writing to the term store.
3. Record response shape, localized labels, term GUIDs, set GUIDs, and parent relations. Do not log tokens or sensitive tenant data.
4. Compare Graph term IDs against `DocumentSourceTag.termGuid` and SKOS concept URIs. Do not assume Semaphore exports preserve Graph GUIDs.
5. If GUIDs differ, report ambiguity and unmatched tags; only allow unique path-based matches with explicit provenance.
6. Verify 429 handling, throttling, paging, and access-denied behavior before enabling any scheduled import.

## Evidence needed to close C-9

A sanitized response sample, HTTP status and scopes (without secrets), comparison results for at least one known tagged file, and a recommendation on direct Graph integration vs SKOS/CSV export.
