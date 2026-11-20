'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Music } from 'lucide-react';
import { formatTimestamp } from '@/lib/transcripts';

// EKP E11.5/E11.6 (Workstream E, E-9): plays a recording in the document
// page. The source is the document's file link: a signed S3 URL, or for a
// no-copy SharePoint file KMS's /preview stream, which passes Range requests
// on so seeking doesn't download the whole file. `startAt` (seconds, from a
// "12:34" citation's ?t=) is applied once the player knows the duration;
// `seek()` (ref) plays from a time, for timestamps in the transcript and chat.
// A signed link lasts an hour; when a long recording's link expires mid-way,
// `getFreshSrc` gets a new one and playback resumes where it was.
const MediaPlayer = forwardRef(function MediaPlayer({ src: initialSrc, kind = 'video', startAt = null, durationSeconds, filename, onTime, getFreshSrc }, ref) {
  const media = useRef(null);
  const pendingStart = useRef(startAt);
  const [src, setSrc] = useState(initialSrc);
  const retried = useRef(false);
  const resume = useRef(null);

  useEffect(() => { setSrc(initialSrc); retried.current = false; }, [initialSrc]);

  const onError = async () => {
    if (!getFreshSrc || retried.current) return;
    retried.current = true; // once per link, so a broken file doesn't loop
    const el = media.current;
    resume.current = { at: el?.currentTime || 0, playing: el ? !el.paused : false };
    const fresh = await getFreshSrc().catch(() => null);
    if (fresh && fresh !== src) {
      pendingStart.current = resume.current.at;
      setSrc(fresh);
    }
  };

  useImperativeHandle(ref, () => ({
    seek(seconds) {
      const el = media.current;
      if (!el) return;
      el.currentTime = Math.max(0, seconds);
      el.play().catch(() => {}); // a browser may refuse to autoplay; the position is still set
    },
  }), []);

  useEffect(() => {
    pendingStart.current = startAt;
    const el = media.current;
    if (el && startAt != null && el.readyState >= 1) {
      el.currentTime = startAt;
      pendingStart.current = null;
    }
  }, [startAt]);

  const onLoadedMetadata = () => {
    const el = media.current;
    if (el && pendingStart.current != null) {
      el.currentTime = pendingStart.current;
      pendingStart.current = null;
    }
    if (el && resume.current?.playing) el.play().catch(() => {});
    resume.current = null;
    retried.current = false;
  };

  const shared = {
    ref: media,
    src,
    controls: true,
    preload: 'metadata',
    onLoadedMetadata,
    onError,
    onTimeUpdate: (e) => onTime?.(e.currentTarget.currentTime),
  };

  if (kind === 'audio') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-5 bg-gray-50 p-6 dark:bg-gray-900">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
          <Music className="h-9 w-9" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{filename}</p>
          {durationSeconds ? <p className="text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(durationSeconds)}</p> : null}
        </div>
        <audio {...shared} className="w-full max-w-xl" />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript is in the Transcript tab */}
      <video {...shared} playsInline className="max-h-full max-w-full" />
    </div>
  );
});

export default MediaPlayer;
