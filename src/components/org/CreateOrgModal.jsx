'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function CreateOrgModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Organization name is required."); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create organization.'); return; }
      onCreate(data);
      onClose();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-full max-w-md"
      >
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Create Organization
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          You'll become the super admin of the new org.
        </p>

        <input
          type="text"
          placeholder="Organization name"
          className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg mb-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoFocus
        />

        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </button>
        </div>
      </motion.div>
    </div>
  );
}
