'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useSession, signIn } from 'next-auth/react';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_admin: 'Department Admin',
  employee: 'Employee',
  guest: 'Guest',
};

export default function InvitePage() {
  const { token } = useParams();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [result, setResult] = useState(null); // { success, message }

  useEffect(() => {
    fetch(`/api/org/invite/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setLoadError(data.error);
        else setInvite(data);
      })
      .catch(() => setLoadError('Failed to load invite.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (authStatus !== 'authenticated') {
      signIn(undefined, { callbackUrl: `/org/invite/${token}` });
      return;
    }

    setAccepting(true);
    try {
      const res = await fetch(`/api/org/invite/${token}/accept`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, message: data.error || 'Failed to accept invite.' });
        return;
      }
      setResult({ success: true, message: `Welcome to ${invite.orgName}!` });
      setTimeout(() => router.push(`/org/${data.orgId}/settings`), 1800);
    } catch {
      setResult({ success: false, message: 'Something went wrong.' });
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => router.push('/dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="text-center max-w-sm">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Invite Unavailable
          </h1>
          <p className="text-gray-500 mb-6">{loadError}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (result?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-sm"
        >
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            You're in!
          </h1>
          <p className="text-gray-500">{result.message}</p>
          <p className="text-sm text-gray-400 mt-2">Redirecting…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 w-full max-w-md text-center"
      >
        <div className="h-14 w-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-5">
          <Building2 className="h-7 w-7 text-blue-600 dark:text-blue-400" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          You're invited!
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-1">
          Join <span className="font-semibold text-gray-900 dark:text-gray-100">{invite.orgName}</span>
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Role: <span className="font-medium">{ROLE_LABELS[invite.role] ?? invite.role}</span>
        </p>

        {result?.success === false && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{result.message}</p>
        )}

        {authStatus === 'unauthenticated' && (
          <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">
            You need to sign in to accept this invitation.
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {accepting && <Loader2 className="h-4 w-4 animate-spin" />}
            {authStatus === 'unauthenticated' ? 'Sign in to Accept' : 'Accept'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
