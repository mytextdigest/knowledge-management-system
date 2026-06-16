'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, FileText, Loader2, Plus, Users, X } from 'lucide-react';
import Layout from '@/components/layout/Layout';

export default function DepartmentPage() {
  const { orgId } = useParams();
  const router = useRouter();

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadDepartments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/${orgId}/department`);
      const data = await res.json();

      if (!res.ok) {
        router.replace('/dashboard');
        return;
      }

      setDepartments(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load departments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) loadDepartments();
  }, [orgId]);

  const createDepartment = async () => {
    if (!name.trim()) return;

    setCreating(true);
    setError('');

    try {
      const res = await fetch(`/api/org/${orgId}/department`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create department.');
        return;
      }

      setDepartments((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setShowCreate(false);
    } catch {
      setError('Failed to create department.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/dashboard')}
                className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </button>

              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-3">
                  <Building2 className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Departments</h1>
                  <p className="text-muted-foreground">
                    Manage departments for this organization.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New Department
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : departments.length === 0 ? (
            <div className="rounded-2xl border bg-card p-12 text-center shadow-sm">
              <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="text-xl font-semibold">No departments yet</h2>
              <p className="mt-2 text-muted-foreground">
                Create a department to organize members and documents.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Create Department
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="rounded-2xl border bg-card p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="mb-4 rounded-xl bg-primary/10 p-3 w-fit">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>

                  <h3 className="text-lg font-semibold">{dept.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Created {new Date(dept.createdAt).toLocaleDateString()}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        Members
                      </div>
                      <p className="mt-1 text-xl font-semibold">
                        {dept._count?.members || 0}
                      </p>
                    </div>

                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        Docs
                      </div>
                      <p className="mt-1 text-xl font-semibold">
                        {dept._count?.documents || 0}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Create Department</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="text-sm font-medium">Department name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Example: Engineering"
              className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>

              <button
                onClick={createDepartment}
                disabled={creating || !name.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}