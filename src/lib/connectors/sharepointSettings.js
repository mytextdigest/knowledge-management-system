// EKP Workstream A: per-org SharePoint connector settings, kept in
// OrgIntegration.scopeConfig next to the connected sites (until Workstream
// B's org settings, F5, exist). Absent means the default, so integrations
// connected before a setting existed behave as they did.
//
//   storeOriginals (A-14)  keep a copy of each file in KMS storage (S3).
//                          Off = no-copy mode: SharePoint stays the only
//                          copy; text is extracted in memory and previews
//                          stream from SharePoint.
//   syncPages (A-15)       also ingest the sites' pages (Site Pages).
//   maxFileSizeMb (A-24)   files above this size are recorded with their
//                          name, permissions and link only: never
//                          downloaded or indexed (8 GB videos, Q&A #188).
//
// Imported by the worker, so relative imports only.

export const SHAREPOINT_SETTING_DEFAULTS = { storeOriginals: true, syncPages: true, maxFileSizeMb: 200 };
const MAX_FILE_SIZE_MB_RANGE = [1, 10_240];

export function sharePointSettings(scopeConfig) {
  return {
    storeOriginals: scopeConfig?.storeOriginals !== false,
    syncPages: scopeConfig?.syncPages !== false,
    maxFileSizeMb: Number.isInteger(scopeConfig?.maxFileSizeMb) ? scopeConfig.maxFileSizeMb : SHAREPOINT_SETTING_DEFAULTS.maxFileSizeMb,
  };
}

/** A-24: whether a file of `size` bytes is above the integration's size limit. */
export function exceedsSizeLimit(size, scopeConfig) {
  return Number(size) > sharePointSettings(scopeConfig).maxFileSizeMb * 1024 * 1024;
}

/** Validate a PATCH body. Returns { data } (only the keys sent) or { error }. */
export function validateSharePointSettingsPatch(body) {
  const data = {};
  for (const key of Object.keys(SHAREPOINT_SETTING_DEFAULTS)) {
    if (body?.[key] === undefined) continue;
    if (key === "maxFileSizeMb") {
      const [min, max] = MAX_FILE_SIZE_MB_RANGE;
      if (!Number.isInteger(body[key]) || body[key] < min || body[key] > max) {
        return { error: `maxFileSizeMb must be a whole number from ${min} to ${max}` };
      }
    } else if (typeof body[key] !== "boolean") return { error: `${key} must be true or false` };
    data[key] = body[key];
  }
  if (!Object.keys(data).length) return { error: "Nothing to update" };
  return { data };
}

/** The settings keys of an existing scopeConfig, to carry over when it's rebuilt. */
export function pickSharePointSettings(scopeConfig) {
  const kept = {};
  for (const key of Object.keys(SHAREPOINT_SETTING_DEFAULTS)) {
    if (scopeConfig?.[key] !== undefined) kept[key] = scopeConfig[key];
  }
  return kept;
}
