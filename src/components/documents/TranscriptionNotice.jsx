'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

// EKP E11.3 (Workstream E, E-10): the notice on a recording with no
// transcript: what KMS is doing about it (waiting, transcribing with
// progress, failed) and the Transcribe / Try again button.
export default function TranscriptionNotice({ doc, onChanged, onShowDetails }) {
  const job = doc?.media?.transcription;
  const canTranscribe = Boolean(doc?.permissions?.canTranscribe);
  const canLink = Boolean(doc?.permissions?.canLinkTranscript);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const transcribe = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/transcribe`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the transcription");
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const button = (label) => canTranscribe && (
    <button type="button" onClick={transcribe} disabled={busy} className="font-medium underline disabled:opacity-50">
      {busy ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : label}
    </button>
  );
  const linkHint = canLink
    ? <>or <button type="button" onClick={onShowDetails} className="font-medium underline">link a transcript under Details</button></>
    : 'or ask an owner to link a transcript';

  let body;
  if (job?.status === 'running') {
    body = <>Transcribing what was said… {job.progress ?? 0}%. Chat, search and the summary use it once it&apos;s done.</>;
  } else if (job?.status === 'queued') {
    body = <>KMS will transcribe this recording in a few minutes, unless its transcript arrives first. {button('Transcribe now')}</>;
  } else if (job?.status === 'failed') {
    body = <>The transcription failed: {job.error || 'unknown error'}. {button('Try again')}{canTranscribe ? ' ' : ''}{linkHint}.</>;
  } else if (job?.status === 'done' && job.error) {
    body = <>{job.error}, so there&apos;s nothing to search or chat about.</>;
  } else {
    body = (
      <>
        No transcript yet, so chat and search can&apos;t use what was said. {canTranscribe ? <>{button('Transcribe it')}, put</> : 'Put'} its .vtt or Teams transcript next to it (same folder and name), {linkHint}.
      </>
    );
  }
  return (
    <>
      {body}
      {error && <span role="alert" className="ml-1 text-red-700 dark:text-red-300">{error}</span>}
    </>
  );
}
