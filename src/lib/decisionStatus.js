// Decision Extraction v2 (docs/tier-2/REQUIREMENTS_DECISION_EXTRACTION_V2_HITL.md)
// Single source of truth for Decision.status/.certainty ordering and labels,
// shared by the API routes and the UI so they can't drift apart.

// Canonical order (Decision 4): pending, active, rejected, reversed, superseded.
export const STATUS_ORDER = ["pending", "active", "rejected", "reversed", "superseded"];

export const STATUS_LABELS = {
  pending: "Pending review",
  active: "Active",
  rejected: "Rejected",
  reversed: "Reversed",
  superseded: "Superseded",
};

// "pending" is set only by the worker at extraction time — a reviewer can
// move a decision OUT of pending (by confirming/rejecting) but never back
// INTO it. See requirements doc's Status Model transition rules.
export const HUMAN_SETTABLE_STATUSES = STATUS_ORDER.filter((s) => s !== "pending");

export function isValidStatus(status) {
  return STATUS_ORDER.includes(status);
}

// Model-side judgment (separate from the human-owned `status` lifecycle).
export const CERTAINTY_ORDER = ["confirmed", "likely", "candidate"];

export const CERTAINTY_LABELS = {
  confirmed: "Confirmed",
  likely: "Likely",
  candidate: "Candidate",
};

export function isValidCertainty(value) {
  return CERTAINTY_ORDER.includes(value);
}

// Sort key for ordering a review queue "confirmed → likely → candidate"
// within a document (requirements doc FR-6).
export function certaintyRank(certainty) {
  const idx = CERTAINTY_ORDER.indexOf(certainty);
  return idx === -1 ? CERTAINTY_ORDER.length : idx;
}
