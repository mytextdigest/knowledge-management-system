'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2, FileText, Users, Layers, FolderKanban, Loader2, KeyRound, Clock,
  Gauge, AlertTriangle, HelpCircle, X, ExternalLink,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';

export default function OrgDashboardPage() {
  const { orgId } = useParams();
  const router = useRouter();

  const [org, setOrg] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [recentProjects, setRecentProjects] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [docCount, setDocCount] = useState(0);
  const [projectCount, setProjectCount] = useState(0);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => {
    if (!orgId) return;

    Promise.all([
      fetch(`/api/org/${orgId}/settings`).then((r) => r.json()),
      fetch(`/api/org/${orgId}/members`).then((r) => r.json()),
      fetch(`/api/org/${orgId}/department`).then((r) => r.json()),
      fetch(`/api/org/${orgId}/projects`).then((r) => r.json()),
      fetch(`/api/org/${orgId}/repository`).then((r) => r.json()),
      fetch(`/api/org/${orgId}/health`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([settingsData, membersData, departmentsData, projectsData, repoData, healthData]) => {
      if (settingsData.error) { router.replace('/welcome-back'); return; }

      const isAdmin = settingsData.role === 'super_admin' || settingsData.role === 'dept_admin';
      if (!isAdmin) { router.replace(`/org/${orgId}`); return; }

      setOrg(settingsData);
      setMemberCount(Array.isArray(membersData) ? membersData.length : 0);
      setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
      setProjectCount(Array.isArray(projectsData) ? projectsData.length : 0);
      setRecentProjects(Array.isArray(projectsData) ? projectsData.slice(0, 5) : []);
      setRecentDocuments(Array.isArray(repoData.documents) ? repoData.documents.slice(0, 5) : []);
      setDocCount(repoData.total ?? 0);
      setHealth(healthData);
    }).finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return (
      <Layout orgId={orgId}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      </Layout>
    );
  }

  const stats = [
    { label: 'Documents', value: docCount, icon: FileText, href: `/org/${orgId}/repository` },
    { label: 'Members', value: memberCount, icon: Users, href: `/org/${orgId}/settings?tab=members` },
    { label: 'Departments', value: departments.length, icon: Layers, href: `/org/${orgId}/settings?tab=departments` },
    { label: 'Projects', value: projectCount, icon: FolderKanban, href: `/org/${orgId}/projects` },
  ];

  return (
    <Layout orgId={orgId}>
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{org?.name} Dashboard</h1>
            <p className="text-sm text-gray-500">Analytics and recent activity across the organization</p>
          </div>
        </div>

        {org?.role === 'super_admin' && !org?.hasApiKey && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-amber-700 dark:text-amber-300 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  No OpenAI API key configured
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Set one up to enable repository ingestion and Enterprise Chat.
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/org/${orgId}/settings?tab=apikey`)}
              className="flex-shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              Set up
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, href }) => (
            <button
              key={label}
              type="button"
              onClick={() => router.push(href)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-2 text-gray-500">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
            </button>
          ))}
        </div>

        {health && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Knowledge Health
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <Gauge className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Answer Confidence</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {health.confidence.avgScore === null ? '—' : `${Math.round(health.confidence.avgScore * 100)}%`}
                </p>
                <p className="text-xs text-gray-500">
                  {health.confidence.sampleSize > 0
                    ? `${health.confidence.distribution.high} high / ${health.confidence.distribution.medium} medium / ${health.confidence.distribution.low} low (last ${health.confidence.sampleSize})`
                    : 'No recent Org Chat answers yet.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowConflicts(true)}
                className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Open Conflicts</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{health.conflicts.openCount}</p>
                <p className="text-xs text-gray-500">Documents flagged with contradictory content</p>
              </button>

              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <HelpCircle className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Top Knowledge Gaps</span>
                </div>
                {health.gaps.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">No recurring gaps detected.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {health.gaps.slice(0, 3).map((gap) => (
                      <li key={gap.topic} className="truncate text-sm text-gray-700 dark:text-gray-300">
                        {gap.topic}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
              <FolderKanban className="h-4 w-4" />
              Recently Created Projects
            </h2>
            {recentProjects.length === 0 ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
                No projects yet.
              </div>
            ) : (
              <div className="space-y-2">
                {recentProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => router.push(`/project?id=${p.id}`)}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.department?.name || 'No department'}</p>
                    </div>
                    <span className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Recently Created Documents
            </h2>
            {recentDocuments.length === 0 ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
                No documents yet.
              </div>
            ) : (
              <div className="space-y-2">
                {recentDocuments.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => router.push(`/document?id=${d.id}`)}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{d.filename}</p>
                      <p className="text-xs text-gray-500">{d.department?.name || 'Org-wide'}</p>
                    </div>
                    <span className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showConflicts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Open Conflicts
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Documents flagged with contradictory content
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConflicts(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!health?.conflicts?.items?.length ? (
              <p className="py-4 text-sm text-gray-500 dark:text-gray-400">No open conflicts.</p>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto">
                {health.conflicts.items.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/10"
                  >
                    <p className="mb-2 text-sm text-gray-800 dark:text-gray-100">{c.summary}</p>
                    <div className="flex flex-col gap-1">
                      {[c.documentA, c.documentB].map((doc) => (
                        <a
                          key={doc.id}
                          href={`/document?id=${doc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                          <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{doc.filename || 'Untitled document'}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
