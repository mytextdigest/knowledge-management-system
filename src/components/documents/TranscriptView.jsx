'use client';

import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { formatTimestamp, transcriptLines } from '@/lib/transcripts';

// EKP E11.5 (Workstream E, E-9): a transcript as timed lines. Clicking a time
// plays the recording from there (onSeek); while it plays, the line being
// said is highlighted and kept in view. Without onSeek the times are plain.
export default function TranscriptView({ chunks, currentTime = null, onSeek, emptyText = 'No transcript lines.', className }) {
  const lines = useMemo(() => transcriptLines(chunks), [chunks]);
  const activeIndex = useMemo(() => {
    if (currentTime == null) return -1;
    let found = -1;
    for (let i = 0; i < lines.length && lines[i].start <= currentTime + 0.25; i++) found = i;
    return found;
  }, [lines, currentTime]);
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  if (!lines.length) return <p className={cn('p-4 text-sm text-gray-500 dark:text-gray-400', className)}>{emptyText}</p>;

  return (
    <ol className={cn('space-y-1 p-3', className)}>
      {lines.map((line, i) => (
        <li
          key={`${line.start}-${i}`}
          ref={i === activeIndex ? activeRef : null}
          className={cn(
            'flex gap-3 rounded-md px-2 py-1.5 text-sm leading-relaxed',
            i === activeIndex ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
          )}
        >
          {onSeek ? (
            <button
              type="button"
              onClick={() => onSeek(line.start)}
              title="Play from here"
              className="shrink-0 w-14 text-left font-mono text-xs leading-6 text-blue-700 hover:underline dark:text-blue-300"
            >
              {formatTimestamp(line.start)}
            </button>
          ) : (
            <span className="shrink-0 w-14 font-mono text-xs leading-6 text-gray-500 dark:text-gray-400">{formatTimestamp(line.start)}</span>
          )}
          <p className="min-w-0 text-gray-800 dark:text-gray-100">
            {line.speaker && <span className="font-semibold text-gray-900 dark:text-gray-50">{line.speaker}: </span>}
            {line.text}
          </p>
        </li>
      ))}
    </ol>
  );
}
