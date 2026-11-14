'use client';

import { useRef } from 'react';
import { Captions, X } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';
import { TRANSCRIPT_ACCEPT, transcriptEntry } from '@/lib/transcriptAttach';

// EKP E11.5 (Workstream E): under a recording in an upload list, "Attach
// transcript", or the attached transcript with a remove button. The
// transcript is uploaded after the recording and linked to it.
export default function AttachTranscript({ transcript, onChange, disabled }) {
  const input = useRef(null);

  if (transcript) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        <Captions className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <span className="min-w-0 truncate text-gray-700 dark:text-gray-300" title={transcript.name}>
          Transcript: {transcript.name} · {formatFileSize(transcript.size)}
        </span>
        {transcript.done && <span className="shrink-0 text-green-700 dark:text-green-400">· linked</span>}
        {!disabled && !transcript.done && (
          <button type="button" onClick={() => onChange(null)} title="Remove the transcript" className="shrink-0 text-gray-400 hover:text-red-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {transcript.error && <span className="shrink-0 text-red-600 dark:text-red-400">· {transcript.error}</span>}
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <input
        ref={input}
        type="file"
        accept={TRANSCRIPT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(transcriptEntry(file));
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); input.current?.click(); }}
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-300"
      >
        <Captions className="h-3.5 w-3.5" /> Attach transcript (.vtt or Teams .docx)
      </button>
    </div>
  );
}
