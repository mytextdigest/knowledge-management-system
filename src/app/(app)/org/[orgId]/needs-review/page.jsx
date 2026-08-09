'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ClipboardList, Loader2, Cloud, Upload, ExternalLink, Check, FolderPlus, X as XIcon } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

const SOURCE_LABELS = {
  manual: { label: 'Manual', icon: Upload },
  sharepoint: { label: 'SharePoint', icon: Cloud },
};

export default function NeedsReviewPage() {
  const { orgId } = useParams();
  const router = useRouter();

  const [role, setRole] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [sourceFilter, setSourceFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const [actioningId, setActioningId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [reassignTarget, setReassignTarget] = useState(null); // doc object
  const [reassignDeptId, setReassignDeptId] = useState('');
  const [newProjectMode, setNewProjectMode] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    fetch(`/api/org/${orgId}/settings`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error || data.role !== 'super_admin') {
          router.replace(`/org/${orgId}/repository`);
          return;
        }
        setRole(data.role);
      })
      .catch(() => router.replace(`/org/${orgId}/repository`));

    fetch(`/api/org/${orgId}/department`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setDepartments(data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    if (role !== 'super_admin') return;
    setLoading(true);
    setError('');
    const search = new URLSearchParams();
    if (sourceFilter) search.set('source', sourceFilter);
    if (departmentFilter) search.set('departmentId', departmentFilter);
    fetch(`/api/org/${orgId}/needs-review?${search.toString()}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Failed to load queue.');
        setDocuments(Array.isArray(data.documents) ? data.documents : []);
      })
      .catch((err) => setError(err.message || 'Failed to load queue.'))
      .finally(() => setLoading(false));
  }, [orgId, role, sourceFilter, departmentFilter]);

  const confirmDocument = async (docId, body) => {
    setActioningId(docId);
    setActionError('');
    try {
      const res = await fetch(`/api/org/${orgId}/needs-review/${docId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to confirm document.');
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setReassignTarget(null);
    } catch (err) {
      setActionError(err.message || 'Failed to confirm document.');
    } finally {
      setActioningId(null);
    }
  };

  const openReassignModal = (doc) => {
    setReassignTarget(doc);
    setReassignDeptId(doc.departmentId || '');
    setNewProjectMode(false);
    setNewProjectName('');
    setActionError('');
  };

  const submitReassign = () => {
    if (!reassignTarget) return;
    if (newProjectMode) {
      if (!newProjectName.trim() || !reassignDeptId) {
        setActionError('Pick a department and name the new project.');
        return;
      }
      confirmDocument(reassignTarget.id, { newProjectName: newProjectName.trim(), departmentId: reassignDeptId });
    } else {
      if (!reassignDeptId) {
        setActionError('Pick a department.');
        return;
      }
      confirmDocument(reassignTarget.id, { departmentId: reassignDeptId });
    }
  };

  if (!role) {
    return (
      <Layout orgId={orgId}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout orgId={orgId}>
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Needs Review</h1>
            <p className="text-sm text-gray-500">
              Documents awaiting confirmation before they're published — manual and synced, in one place.
            </p>
          </div>
        </div>

        <div className="flex gap-2 my-5">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All sources</option>
            <option value="manual">Manual</option>
            <option value="sharepoint">SharePoint</option>
          </select>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        </div>

        {actionError && (
          <div className="mb-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-300">
            {actionError}
          </div>
        )}

        {error ? (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300">
            {error}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Nothing to review</h2>
            <p className="mt-1 text-sm text-gray-500">
              Documents flagged by classification or freshly synced from a connector will show up here.
            </p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Document</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Source</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Department</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Suggested Category</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Date</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {documents.map((doc) => {
                    const sourceMeta = SOURCE_LABELS[doc.source] || { label: doc.source, icon: Upload };
                    const SourceIcon = sourceMeta.icon;
                    const stillProcessing = !['ready', 'embedded', 'chunked'].includes(doc.processingStatus);
                    const isActing = actioningId === doc.id;
                    return (
                      <tr key={doc.id} className="bg-white dark:bg-gray-900">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-xs">{doc.filename}</p>
                          {stillProcessing && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">Processing ({doc.processingStatus})…</p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                            doc.source === 'sharepoint'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          )}>
                            <SourceIcon className="h-3 w-3" />
                            {sourceMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {doc.departmentName || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {doc.suggestedCategory || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            <a
                              href={`/document?id=${doc.id}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              View
                            </a>
                            <button
                              onClick={() => confirmDocument(doc.id, {})}
                              disabled={isActing}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex-shrink-0"
                            >
                              {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Accept
                            </button>
                            <button
                              onClick={() => openReassignModal(doc)}
                              disabled={isActing}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 flex-shrink-0"
                            >
                              <FolderPlus className="h-3.5 w-3.5" />
                              Reassign
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {reassignTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-5 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Reassign</h3>
            <p className="text-xs text-gray-500 mb-4 truncate">{reassignTarget.filename}</p>

            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Department</label>
            <select
              value={reassignDeptId}
              onChange={(e) => setReassignDeptId(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            >
              <option value="">Select a department…</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-3">
              <input
                type="checkbox"
                checked={newProjectMode}
                onChange={(e) => setNewProjectMode(e.target.checked)}
              />
              Assign to a new project under this department
            </label>

            {newProjectMode && (
              <input
                type="text"
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              />
            )}

            {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setReassignTarget(null)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
              >
                <XIcon className="h-4 w-4 inline mr-1" />
                Cancel
              </button>
              <button
                onClick={submitReassign}
                disabled={actioningId === reassignTarget.id}
                className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                {actioningId === reassignTarget.id && <Loader2 className="h-4 w-4 animate-spin" />}
                {newProjectMode ? 'Create & Assign' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
