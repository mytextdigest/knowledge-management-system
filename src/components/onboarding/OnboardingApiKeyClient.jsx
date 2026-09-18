'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Key, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';

export default function OnboardingApiKeyClient({ orgId, nextStep }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const router = useRouter();

  const handleVerify = async () => {
    if (!apiKey.trim()) {
      setStatus({ type: 'error', message: 'Please enter an API key.' });
      return;
    }
    setVerifying(true);
    setStatus({ type: 'loading', message: 'Verifying your API key...' });
    try {
      const res = await fetch('/api/settings/verify-openai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const result = await res.json();
      if (result.valid) {
        setVerified(true);
        setStatus({ type: 'success', message: 'API key is valid and ready to use!' });
      } else {
        setVerified(false);
        setStatus({ type: 'error', message: result.error || 'Invalid API key.' });
      }
    } catch {
      setVerified(false);
      setStatus({ type: 'error', message: 'Failed to verify API key.' });
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!verified) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/org/${orgId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openaiApiKey: apiKey }),
      });
      if (!res.ok) throw new Error('Failed to save API key.');
      router.push(nextStep);
    } catch {
      setStatus({ type: 'error', message: 'Failed to save API key. Please try again.' });
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Key className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Set up your OpenAI API key</h1>
          <p className="text-muted-foreground text-sm mt-2">
            This key powers document ingestion and chat for everyone in your organization.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-lg p-6 space-y-4">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setVerified(false); }}
              placeholder="sk-..."
              className="w-full p-2.5 pr-10 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {status && (
            <p className={`text-sm flex items-center gap-2 ${status.type === 'success' ? 'text-green-600' : status.type === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
              {status.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {status.message}
            </p>
          )}

          {!verified ? (
            <button
              onClick={handleVerify}
              disabled={verifying || !apiKey.trim()}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify Key
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save & Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
