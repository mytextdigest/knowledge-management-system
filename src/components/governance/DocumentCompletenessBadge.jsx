"use client";
import { useEffect, useState } from 'react';
export default function DocumentCompletenessBadge({ documentId }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!documentId) return;
    let live = true;
    fetch(`/api/documents/${encodeURIComponent(documentId)}/completeness`, { cache: 'no-store' })
      .then(async res => { if (!res.ok) throw new Error('Unavailable'); return res.json(); })
      .then(data => { if (live) setState(data.completeness); })
      .catch(() => { if (live) setState(null); });
    return () => { live = false; };
  }, [documentId]);
  if (!state) return null;
  return <div className="mx-auto max-w-xl rounded-lg border p-3 text-sm" role="status">
    <span className="font-medium">Publishing metadata: {state.completed}/{state.total} required fields</span>
    {state.missing.length > 0 && <p className="mt-1 text-amber-700 dark:text-amber-300">
      Missing: {state.missing.join(', ')}. Publication is blocked until complete.
    </p>}
    {state.complete && <p className="mt-1 text-green-700 dark:text-green-300">Metadata requirements satisfied.</p>}
  </div>;
}
