'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, KeyRound, Loader2, CheckCircle2, AlertCircle, Unplug } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

// EKP A-5: Settings → Integrations → Microsoft sign-in (super_admin only).
// Connect runs Microsoft's admin approval for the KMS Sign-in app; the
// tenant's verified domains come back from Microsoft and are the only
// domains that can be enabled.

const PROVISIONING_OPTIONS = [
  { value: 'auto', label: 'Anyone in the Microsoft organization', hint: 'They join this org as Employee on first sign-in (or with their invite\'s role).' },
  { value: 'invite_only', label: 'Invited people only', hint: 'Only existing members and people with a pending invite can get in.' },
];

const PASSWORD_OPTIONS = [
  { value: 'admins_only', label: 'Super admins only', hint: 'Everyone else on these domains must use Microsoft. Super admins keep a password as an emergency way in.' },
  { value: 'all', label: 'Everyone', hint: 'Users can choose Microsoft or their KMS password.' },
];

export default function MicrosoftSignInPage() {
  const { orgId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(searchParams.get('error') || '');
  const [notice, setNotice] = useState(searchParams.get('connected') ? 'Microsoft organization connected.' : '');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/${orgId}/sso`);
      const data = await res.json();
      if (res.status === 403) { router.replace(`/org/${orgId}/settings`); return; }
      if (!res.ok) throw new Error(data.error || 'Failed to load Microsoft sign-in settings.');
      setConfig(data);
      setDraft(data.connected ? {
        allowedDomains: data.allowedDomains,
        provisioning: data.provisioning,
        passwordLogin: data.passwordLogin,
        enabled: data.enabled,
      } : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const toggleDomain = (domain) => {
    setDraft((prev) => ({
      ...prev,
      allowedDomains: prev.allowedDomains.includes(domain)
        ? prev.allowedDomains.filter((d) => d !== domain)
        : [...prev.allowedDomains, domain],
    }));
  };

  const dirty = config?.connected && draft && (
    draft.provisioning !== config.provisioning ||
    draft.passwordLogin !== config.passwordLogin ||
    draft.enabled !== config.enabled ||
    [...draft.allowedDomains].sort().join() !== [...config.allowedDomains].sort().join()
  );

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/org/${orgId}/sso`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save.');
      setConfig((prev) => ({ ...prev, ...data }));
      setNotice('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Microsoft sign-in? Users can still sign in with a KMS password (or reset one by email).')) return;
    setDisconnecting(true);
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/sso`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to disconnect.');
      setNotice('Microsoft sign-in disconnected.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  const connectHref = `/api/org/${orgId}/sso/connect`;

  return (
    <Layout orgId={orgId}>
      <div className="max-w-3xl mx-auto py-8 px-4">
        <button
          onClick={() => router.push(`/org/${orgId}/settings?tab=integrations`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Integrations
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Microsoft sign-in</h1>
            <p className="text-sm text-gray-500">Let your employees sign in to KMS with their Microsoft work account.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-800 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {notice}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : !config?.connected ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Connecting sends you to Microsoft. <strong>An administrator of your Microsoft organization</strong> must
              approve the KMS Sign-in app for the whole organization. If that isn't you, ask your Microsoft admin to
              sign in at that step.
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-1">
              <li>KMS only asks for basic profile and sign-in access, not files or mail.</li>
              <li>After approval you choose which of your organization's verified email domains may sign in.</li>
            </ul>
            {config?.available === false ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">Microsoft sign-in isn't configured on this KMS deployment.</p>
            ) : (
              <a
                href={connectHref}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
              >
                Connect Microsoft
              </a>
            )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100">{config.tenantName || 'Microsoft organization'}</p>
                <p className="text-xs text-gray-500 truncate">Tenant ID {config.tenantId}</p>
              </div>
              <a
                href={connectHref}
                className="text-sm text-primary-600 hover:underline flex-shrink-0"
                title="Re-run Microsoft approval, e.g. after adding a domain in Microsoft"
              >
                Reconnect
              </a>
            </div>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Email domains</h2>
              <p className="text-xs text-gray-500">People can sign in with Microsoft only if their email is on a selected domain. Only domains your Microsoft organization has verified are listed.</p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                {config.verifiedDomains.map((domain) => (
                  <label key={domain} className="flex items-center gap-3 px-4 py-3 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.allowedDomains.includes(domain)}
                      onChange={() => toggleDomain(domain)}
                      className="h-4 w-4"
                    />
                    <span className="text-gray-900 dark:text-gray-100">{domain}</span>
                  </label>
                ))}
              </div>
            </section>

            <OptionGroup
              title="Who can join"
              options={PROVISIONING_OPTIONS}
              value={draft.provisioning}
              onChange={(provisioning) => setDraft((prev) => ({ ...prev, provisioning }))}
            />

            <OptionGroup
              title="Who can still use a KMS password"
              options={PASSWORD_OPTIONS}
              value={draft.passwordLogin}
              onChange={(passwordLogin) => setDraft((prev) => ({ ...prev, passwordLogin }))}
            />

            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="h-4 w-4"
              />
              <span className="text-gray-900 dark:text-gray-100">Microsoft sign-in is on</span>
            </label>

            <div className="flex items-center justify-between gap-4 pt-2">
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20 text-sm font-medium disabled:opacity-50"
              >
                <Unplug className="h-4 w-4" />
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}

function OptionGroup({ title, options, value, onChange }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
        {options.map((option) => (
          <label key={option.value} className={cn('flex items-start gap-3 px-4 py-3 text-sm cursor-pointer')}>
            <input
              type="radio"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 mt-0.5"
            />
            <span>
              <span className="block text-gray-900 dark:text-gray-100">{option.label}</span>
              <span className="block text-xs text-gray-500">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
