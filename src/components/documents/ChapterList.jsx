'use client';

import { formatTimestamp } from '@/lib/transcripts';
import { cn } from '@/lib/utils';

// EKP E11.7 (Workstream E, E-11): a recording's chapters (topic segments with
// start and end times). Clicking one plays the recording from there; the
// chapter being played is highlighted.
export default function ChapterList({ chapters = [], currentTime = 0, onSeek }) {
  if (!chapters.length) {
    return <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No chapters yet. They are made from the transcript once there is one.</p>;
  }
  const current = chapters.findLastIndex((c) => currentTime >= c.start);
  return (
    <ol className="divide-y divide-gray-100 dark:divide-gray-800">
      {chapters.map((c, i) => (
        <li key={`${c.start}-${i}`}>
          <button
            type="button"
            onClick={() => onSeek?.(c.start)}
            className={cn(
              'flex w-full items-baseline gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800',
              i === current && 'bg-blue-50 dark:bg-blue-900/20'
            )}
          >
            <span className="w-14 shrink-0 font-mono text-xs text-blue-700 dark:text-blue-300">{formatTimestamp(c.start)}</span>
            <span className="min-w-0 flex-1 text-gray-900 dark:text-gray-100">{c.title}</span>
            <span className="shrink-0 text-xs text-gray-400">{formatTimestamp(Math.max(0, c.end - c.start))}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
