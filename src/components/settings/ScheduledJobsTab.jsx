'use client';
import { useEffect, useState } from 'react';
import { Loader2, Play, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// EKP F3: Settings → Scheduled jobs (super_admin only). Lists this org's jobs
// from src/lib/jobs/registry.js; the worker's scheduler runs them.

function formatInterval(minutes) {
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes === 60) return 'Every hour';
  if (minutes < 1440) return `Every ${minutes / 60} hours`;
  return 'Every day';
}

// Read a JSON body, or explain a failed response that has none (e.g. a 500).
async function readJson(res) {
  const data = await res.json().catch(() => null);
  if (data) return data;
  return { error: res.ok ? 'Unexpected empty response.' : `Server error (${res.status}). Check the server logs.` };
}

function formatWhen(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function ScheduledJobsTab({ orgId }) {
  const [jobs, setJobs] = useState(null);
  const [intervalChoices, setIntervalChoices] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/jobs`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to load scheduled jobs.');
      setJobs(data.jobs);
      setIntervalChoices(data.intervalChoices);
    } catch (err) {
      setError(err.message);
      setJobs([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const act = async (job, path, init) => {
    setBusyId(job.id);
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/jobs/${job.id}${path}`, init);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Request failed.');
      setJobs((prev) => prev.map((j) => (j.id === job.id ? data.job : j)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const patch = (job, body) =>
    act(job, '', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const runNow = (job) => act(job, '/run', { method: 'POST' });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Background jobs for this organization. Tick <span className="font-medium">Run automatically</span> to
        run a job on its schedule; <span className="font-medium">Run now</span> runs it once, even when automatic runs
        are off. New jobs start with automatic runs off.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {jobs === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-gray-500">No scheduled jobs yet. Jobs appear here when the feature they belong to is set up (e.g. SharePoint sync once SharePoint is connected).</p>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          {jobs.map((job) => (
            <div key={job.id} className="px-4 py-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{job.label}</p>
                  {job.description && <p className="text-xs text-gray-500 mt-0.5">{job.description}</p>}
                </div>
                <label
                  className="flex items-center gap-2 text-sm cursor-pointer flex-shrink-0"
                  title={job.enabled ? 'Runs on the schedule below. Untick to stop automatic runs.' : 'Only runs when you click Run now. Tick to run on the schedule below.'}
                >
                  <input
                    type="checkbox"
                    checked={job.enabled}
                    disabled={busyId === job.id}
                    onChange={(e) => patch(job, { enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Run automatically</span>
                  <span className={cn('font-semibold', job.enabled ? 'text-green-700 dark:text-green-300' : 'text-gray-500')}>
                    {job.enabled ? 'On' : 'Off'}
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-600 dark:text-gray-400">
                <select
                  value={job.intervalMinutes}
                  disabled={busyId === job.id}
                  onChange={(e) => patch(job, { intervalMinutes: Number(e.target.value) })}
                  className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                >
                  {(job.intervalChoices || intervalChoices).map((m) => <option key={m} value={m}>{formatInterval(m)}</option>)}
                </select>
                <span><Clock className="inline h-3.5 w-3.5 mr-1" />Next run: {job.enabled ? formatWhen(job.nextRunAt) : 'not scheduled (Run now only)'}</span>
                <span>Last run: {formatWhen(job.lastRunAt)}</span>
                {job.lastStatus && (
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold',
                    job.lastStatus === 'ok' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
                    job.lastStatus === 'failed' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                    job.lastStatus === 'running' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  )}>
                    {job.lastStatus === 'ok' && <CheckCircle2 className="h-3 w-3" />}
                    {job.lastStatus === 'ok' ? 'Succeeded' : job.lastStatus === 'failed' ? 'Failed' : 'Running'}
                  </span>
                )}
                {job.lastResult?.skipped && <span>Skipped: {job.lastResult.skipped}</span>}
                <button
                  onClick={() => runNow(job)}
                  disabled={busyId === job.id || job.runRequested}
                  className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  {job.runRequested ? 'Queued (within a minute)' : 'Run now'}
                </button>
              </div>
              {job.lastStatus === 'failed' && job.lastError && (
                <p className="text-xs text-red-700 dark:text-red-300">{job.lastError}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
