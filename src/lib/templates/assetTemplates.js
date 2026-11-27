// EKP E14 (E-16): templates for common knowledge assets (How-To, FAQ, SOP,
// Key Takeaways). Pure rules shared by the API, the pages and the tests; no
// imports, so it is safe in client bundles.
//
// A template (AssetTemplate) has immutable versions (AssetTemplateVersion):
// saving a change makes version N+1, and an asset keeps the version it was
// written from (Document.templateVersionId), so changing a template never
// changes existing assets (E14.4).
//
// An asset is a repository Document with contentType "asset" and no file:
//   assetData = { format: "markdown", sections: { [key]: "markdown text" } }
//   content   = the rendered text (title, then each section), which the
//               worker chunks and embeds like any document (E14.3).

export const ASSET_CONTENT_TYPE = "asset";

export const LIMITS = Object.freeze({
  nameLength: 80,
  sections: 20,
  sectionTitleLength: 120,
  guidanceLength: 1000,
  assetTitleLength: 200,
  sectionTextLength: 20000,
});

// Metadata a template can require before an asset is saved (a subset of the
// publishing-completeness fields, governance/completeness.mjs).
export const TEMPLATE_FIELDS = Object.freeze([
  { key: "departmentId", label: "Department" },
  { key: "category", label: "Category" },
]);
const FIELD_KEYS = new Set(TEMPLATE_FIELDS.map((f) => f.key));

export const STARTER_TEMPLATES = Object.freeze([
  {
    name: "How-To Guide",
    requiredFields: ["departmentId"],
    sections: [
      { title: "Purpose", guidance: "What this guide helps someone do, and when they would need it.", required: true },
      { title: "Before you start", guidance: "Access, tools, safety precautions and anything to check first.", required: false },
      { title: "Steps", guidance: "Numbered steps, one action each. Say what the person should see after each step.", required: true },
      { title: "Troubleshooting", guidance: "Common problems and how to fix them.", required: false },
      { title: "Related resources", guidance: "Links to procedures, drawings, or the people to ask.", required: false },
    ],
  },
  {
    name: "FAQ",
    requiredFields: [],
    sections: [
      { title: "Audience", guidance: "Who these questions come from (new hires, field crews, a project team).", required: false },
      { title: "Questions and answers", guidance: "Each question in bold, followed by its answer. Keep answers short and link to details.", required: true },
    ],
  },
  {
    name: "SOP",
    requiredFields: ["departmentId", "category"],
    sections: [
      { title: "Purpose", guidance: "Why this procedure exists.", required: true },
      { title: "Scope", guidance: "Where, to whom and to which equipment or systems it applies.", required: true },
      { title: "Roles and responsibilities", guidance: "Who does what, by role.", required: false },
      { title: "Procedure", guidance: "The numbered steps, in order. Mark safety-critical steps.", required: true },
      { title: "Records", guidance: "What is logged or kept, and where.", required: false },
      { title: "References", guidance: "Standards, regulations and related procedures.", required: false },
    ],
  },
  {
    name: "Key Takeaways",
    requiredFields: [],
    sections: [
      { title: "Context", guidance: "The meeting, project, event or document these takeaways come from, and when.", required: true },
      { title: "Key takeaways", guidance: "The most important points, as a short list.", required: true },
      { title: "Decisions and actions", guidance: "What was decided, and who does what next.", required: false },
      { title: "People to contact", guidance: "Who knows more.", required: false },
    ],
  },
]);

const str = (v) => (typeof v === "string" ? v : "");

/** A stable key for a section title ("Before you start" → "before_you_start"). */
export function sectionKey(title, taken = new Set()) {
  const base = str(title).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "section";
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  return key;
}

/**
 * Validates a template's name, sections and required fields. Sections keep
 * their key when they have one (so an edited section stays the same section
 * across versions), and get one from their title otherwise.
 * Returns { data: { name, sections, requiredFields } } or { error }.
 */
export function validateTemplateInput(input) {
  const name = str(input?.name).trim();
  if (!name) return { error: "Give the template a name." };
  if (name.length > LIMITS.nameLength) return { error: `Keep the name under ${LIMITS.nameLength} characters.` };

  const rawSections = Array.isArray(input?.sections) ? input.sections : [];
  if (!rawSections.length) return { error: "Add at least one section." };
  if (rawSections.length > LIMITS.sections) return { error: `A template can have at most ${LIMITS.sections} sections.` };

  const taken = new Set();
  const sections = [];
  for (const [i, raw] of rawSections.entries()) {
    const title = str(raw?.title).trim();
    if (!title) return { error: `Section ${i + 1} needs a title.` };
    if (title.length > LIMITS.sectionTitleLength) return { error: `Section "${title.slice(0, 30)}…" has too long a title.` };
    const guidance = str(raw?.guidance).trim();
    if (guidance.length > LIMITS.guidanceLength) return { error: `The guidance for "${title}" is too long.` };
    const given = str(raw?.key).trim();
    const key = /^[a-z0-9_]{1,40}$/.test(given) && !taken.has(given) ? given : sectionKey(title, taken);
    taken.add(key);
    sections.push({ key, title, guidance, required: raw?.required === true });
  }
  if (!sections.some((s) => s.required)) return { error: "Mark at least one section as required." };

  const rawFields = Array.isArray(input?.requiredFields) ? input.requiredFields : [];
  const unknown = rawFields.find((f) => !FIELD_KEYS.has(f));
  if (unknown !== undefined) return { error: `"${unknown}" isn't a field a template can require.` };
  const requiredFields = TEMPLATE_FIELDS.map((f) => f.key).filter((k) => rawFields.includes(k));

  return { data: { name, sections, requiredFields } };
}

/** Whether a new version is needed (the sections or required fields changed). */
export function versionChanged(latest, data) {
  if (!latest) return true;
  return JSON.stringify(latest.sections) !== JSON.stringify(data.sections)
    || JSON.stringify(latest.requiredFields || []) !== JSON.stringify(data.requiredFields);
}

/**
 * Validates an asset against the template version it is written from.
 * input: { title, sections: { key: text }, departmentId, category }
 * Returns { data: { title, sections, departmentId, category } } or { error, field? }.
 */
export function validateAssetInput(version, input) {
  const title = str(input?.title).trim();
  if (!title) return { error: "Give it a title.", field: "title" };
  if (title.length > LIMITS.assetTitleLength) return { error: `Keep the title under ${LIMITS.assetTitleLength} characters.`, field: "title" };

  const values = input?.sections && typeof input.sections === "object" ? input.sections : {};
  const sections = {};
  for (const section of version.sections || []) {
    const text = str(values[section.key]).replace(/\r\n/g, "\n").trim();
    if (text.length > LIMITS.sectionTextLength) return { error: `"${section.title}" is too long.`, field: section.key };
    if (section.required && !text) return { error: `"${section.title}" is required.`, field: section.key };
    if (text) sections[section.key] = text;
  }

  const departmentId = str(input?.departmentId).trim() || null;
  const category = str(input?.category).trim() || null;
  const required = new Set(version.requiredFields || []);
  if (required.has("departmentId") && !departmentId) return { error: "Choose a department.", field: "departmentId" };
  if (required.has("category") && !category) return { error: "Choose a category.", field: "category" };

  return { data: { title, sections, departmentId, category } };
}

/**
 * The asset's text for search, chat and summaries: the title, then each
 * filled section under its heading (Markdown).
 */
export function renderAssetText(version, { title, sections }, templateName = "") {
  const parts = [`# ${title}`];
  if (templateName) parts.push(`_${templateName}_`);
  for (const section of version.sections || []) {
    const text = sections?.[section.key];
    if (text) parts.push(`## ${section.title}\n\n${text}`);
  }
  return parts.join("\n\n");
}

/** The assetData JSON stored on the document. */
export const assetData = (sections) => ({ format: "markdown", sections });
