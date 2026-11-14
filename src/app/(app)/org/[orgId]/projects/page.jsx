'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { Trash2, Plus, Search, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import DeleteProjectModal from '@/components/modals/DeleteProjectModal';
import CreateProjectModal from '@/components/modals/CreateProjectModal';
import EditProjectModal from '@/components/modals/EditProjectModal';

export default function OrgProjectsPage() {
  const { orgId } = useParams();
  const router = useRouter();

  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (orgId) {
      loadProjects();
      loadDepartments();
    }
  }, [orgId]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/org/${orgId}/projects`);
      if (!res.ok) throw new Error('Failed to fetch projects');
      setProjects(await res.json());
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await fetch(`/api/org/${orgId}/department`);
      if (!res.ok) return;
      setDepartments(await res.json());
    } catch {
      setDepartments([]);
    }
  };

  const openProject = (id) => router.push(`/project?id=${id}`);

  const handleCreate = async (name, description, departmentId) => {
    try {
      const res = await fetch(`/api/org/${orgId}/department/${departmentId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const result = await res.json();
      if (!res.ok) {
        return {
          error: true,
          message: result.message ||
            (result.error === 'PROJECT_ALREADY_EXISTS'
              ? 'A project with this name already exists in this department.'
              : 'Failed to create project.'),
        };
      }
      await loadProjects();
      return { success: true };
    } catch {
      return { error: true, message: 'Network error. Please try again.' };
    }
  };

  const confirmDelete = async (id) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (res.ok && result.success) {
        await loadProjects();
      } else {
        alert(`Delete failed: ${result.error || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (name, description) => {
    if (!editTarget) return;
    setIsEditingProject(true);
    try {
      const res = await fetch(`/api/projects/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(result.error || 'Failed to update project');
        return;
      }
      setProjects((prev) =>
        prev.map((p) => (p.id === editTarget.id ? { ...p, name: result.name, description: result.description } : p))
      );
      setEditTarget(null);
    } finally {
      setIsEditingProject(false);
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Layout orgId={orgId}>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Projects</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Projects visible to everyone in this organization.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="h-12 text-base font-medium bg-primary-600 hover:bg-primary-700">
            <Plus className="w-5 h-5 mr-2" />
            New Project
          </Button>
        </div>

        <div className="mb-6">
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="w-full max-w-md"
          />
        </div>

        <div className="flex items-center space-x-4 mb-6">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
          </div>
          {loading && (
            <div className="flex items-center space-x-2 text-primary-600 dark:text-primary-400">
              <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          )}
        </div>

        {filteredProjects.length === 0 && !loading ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <Plus className="w-8 h-8 text-gray-600 dark:text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No projects yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Create the first project for this organization.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Project</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="group relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300 hover:shadow-lg overflow-hidden"
              >
                <div className="relative p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        onClick={(e) => { e.stopPropagation(); setEditTarget(project); }}
                        title="Edit Project"
                      >
                        <Pencil className="w-4 h-4 text-blue-500" />
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: project.id, name: project.name }); }}
                        title="Delete Project"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>

                  <div onClick={() => openProject(project.id)} className="cursor-pointer">
                    {project.department?.name && (
                      <span className="inline-block mb-2 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                        {project.department.name}
                      </span>
                    )}
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      {project.name}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm line-clamp-2">
                      {project.description || 'No description provided'}
                    </p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {new Date(project.created_at).toLocaleDateString()} · {project.user?.name || project.user?.email}
                      </span>
                      <div className="flex items-center space-x-1 text-primary-600 dark:text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-sm font-medium">Open</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          departments={departments}
        />
      )}
      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => { await confirmDelete(deleteTarget.id); setDeleteTarget(null); }}
        />
      )}
      <EditProjectModal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveEdit}
        project={editTarget}
        isLoading={isEditingProject}
      />
    </Layout>
  );
}
