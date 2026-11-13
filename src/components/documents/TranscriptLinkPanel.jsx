'use client';

import { useState } from 'react';
import { Link2, Unlink, Search, Loader2 } from 'lucide-react';
import { formatTimestamp } from '@/lib/transcripts';
import { UPLOAD_WINDOW_DAYS } from '@/lib/transcriptLinking';

// Why a same-name file wasn't linked automatically (transcriptLinking.matchRecordings).
const REASONS = {
  ambiguous: 'more than one recording fits',
  length_differs: "its length doesn't match",
  length_unknown: "the recording's length isn't known yet",
  uploaded_apart: `uploaded more than ${UPLOAD_WINDOW_DAYS} days apart`,
  match: 'matches',
};

// EKP E11.5 (Workstream E, E-8): the Details tab's transcript ↔ recording
// link. On a recording: its transcripts, unlink, and link another. On a
// transcript: its recording, unlink, and link one. A link set here is
// "manual", and a sync never changes it. When nothing is linked, the
// same-name files next to it are offered, with why KMS didn't link them.
export default function TranscriptLinkPanel({ doc, onChanged }) {
  const media = doc?.media;
  const isRecording = media && media.kind !== 'transcript';
  const canLink = Boolean(doc?.permissions?.canLinkTranscript);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  if (!media) return null;

  const search = async (e) => {
    e?.preventDefault();
    setError('');
    setBusy('search');
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/transcript-link?q=${encodeURIComponent(query)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't search");
      setItems((data.items || []).filter((i) => !i.linked));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const change = async (body, key) => {
    setError('');
    setBusy(key);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/transcript-link`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't change the link");
      setItems(null);
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const linked = isRecording
    ? media.transcripts.map((t) => ({ id: t.id, filename: t.filename, source: t.linkSource, unlink: { transcriptId: t.id, linked: false } }))
    : media.recording
      ? [{ id: media.recording.id, filename: media.recording.filename, source: media.linkSource, unlink: { recordingId: null } }]
      : [];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{isRecording ? 'Transcripts' : 'Recording'}</h3>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        {isRecording
          ? 'Chat and search use the transcript of this recording; answers cite times you can play from.'
          : 'Search and chat cite this transcript as the recording, at the time each line was said.'}
      </p>

      {linked.length ? (
        <ul className="mb-3 space-y-2">
          {linked.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
              <a href={`/document?id=${encodeURIComponent(l.id)}`} className="min-w-0 flex-1 truncate font-medium text-blue-700 hover:underline dark:text-blue-300" title={l.filename}>{l.filename}</a>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{l.source === 'manual' ? 'linked by hand' : 'linked automatically'}</span>
              {canLink && (
                <button
                  type="button"
                  onClick={() => change(l.unlink, `unlink-${l.id}`)}
                  disabled={Boolean(busy)}
                  title="Unlink"
                  className="shrink-0 inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {busy === `unlink-${l.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />} Unlink
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          {isRecording
            ? 'No transcript yet. A .vtt or Teams transcript with the same name, in the same folder and of the same length, is linked automatically; you can also attach one when you upload a recording.'
            : 'Not linked to a recording.'}
        </p>
      )}

      {media.suggestions?.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="mb-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
            {isRecording ? 'Possible transcripts' : 'Possible recordings'}: KMS didn't link {media.suggestions.length === 1 ? 'it' : 'them'} automatically.
          </p>
          <ul className="space-y-1.5">
            {media.suggestions.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <a href={`/document?id=${encodeURIComponent(s.id)}`} className="block truncate text-gray-900 hover:underline dark:text-gray-100" title={s.filename}>{s.filename}</a>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {s.durationSeconds ? `${formatTimestamp(s.durationSeconds)} · ` : ''}{REASONS[s.reason] || s.reason}
                  </span>
                </div>
                {canLink && (
                  <button
                    type="button"
                    onClick={() => change(isRecording ? { transcriptId: s.id, linked: true } : { recordingId: s.id }, `link-${s.id}`)}
                    disabled={Boolean(busy)}
                    className="shrink-0 inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy === `link-${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Link
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canLink && (isRecording || !media.recording) && (
        <>
          <form onSubmit={search} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isRecording ? 'Find a transcript by name' : 'Find a recording by name'}
              className="h-8 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-600 dark:bg-gray-900"
            />
            <button type="submit" disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
              {busy === 'search' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Find
            </button>
          </form>
          {items && (
            items.length ? (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={item.filename}>{item.filename}</span>
                    <button
                      type="button"
                      onClick={() => change(isRecording ? { transcriptId: item.id, linked: true } : { recordingId: item.id }, `link-${item.id}`)}
                      disabled={Boolean(busy)}
                      className="shrink-0 inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy === `link-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Link
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{isRecording ? 'No transcripts found.' : 'No recordings found.'}</p>
            )
          )}
        </>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
