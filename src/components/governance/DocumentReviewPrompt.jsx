"use client";
import { useCallback, useEffect, useState } from "react";
import ReviewTaskCard from "@/components/governance/ReviewTaskCard";

// B-18: on the document page, the viewer's pending periodic review of this
// document (review notifications link here), so it can be done in place.
export default function DocumentReviewPrompt({ orgId, documentId }) {
  const [review, setReview] = useState(null);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/org/${encodeURIComponent(orgId)}/reviews?mine=1&status=pending&documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    setReview(body.items?.[0] || null);
  }, [orgId, documentId]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  if (done) return <p role="status" className="mb-3 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">{done}</p>;
  if (!review) return null;
  return <div className="mb-3">
    <ReviewTaskCard orgId={orgId} review={review} showDocumentLink={false}
      onDone={(outcome) => setDone(outcome === "valid" ? "Thanks, the document is confirmed as still valid." : outcome === "update" ? "Update requested: the document is back in draft and its owner was notified." : "Retirement recommended: the owner was asked to start a decommission.")} />
  </div>;
}
