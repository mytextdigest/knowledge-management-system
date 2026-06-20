"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus, Pencil, Trash2 } from "lucide-react";
import RepositoryDocumentCard from "@/components/repository/RepositoryDocumentCard";
import RepositoryFilters from "@/components/repository/RepositoryFilters";
import UploadToRepositoryModal from "@/components/repository/UploadToRepositoryModal";
import CreateProjectModal from "@/components/modals/CreateProjectModal";
import EditProjectModal from "@/components/modals/EditProjectModal";
import DeleteProjectModal from "@/components/modals/DeleteProjectModal";
import Layout from "@/components/layout/Layout";
import { useSession } from "next-auth/react";

const FILTER_PARAM_MAP = {
  category: "category",
  lifecycle: "lifecycle",
  fileType: "fileType",
  dateFrom: "dateFrom",
  dateTo: "dateTo",
};

const initialFilters = {
  category: "",
  lifecycle: "",
  fileType: "",
  dateFrom: "",
  dateTo: "",
};

export default function DepartmentPage({ params }) {
  const { orgId, deptId } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [tab, setTab] = useState("documents");
  const [department, setDepartment] = useState(null);

  // Documents tab state
  const [documents, setDocuments] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  // Projects tab state
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [isEditingProject, setIsEditingProject] = useState(false);

  const queryString = useMemo(() => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) search.set(FILTER_PARAM_MAP[key] || key, value);
    });
    search.set("dept", deptId);
    search.set("page", String(page));
    return search.toString();
  }, [filters, page, deptId]);

  useEffect(() => {
    if (!orgId || !deptId) return;
    fetch(`/api/org/${orgId}/department`)
      .then((r) => r.json())
      .then((data) => {
        const dept = Array.isArray(data) ? data.find((d) => d.id === deptId) : null;
        setDepartment(dept || null);
      })
      .catch(() => {});

    // Remember this as the last-visited department for this org membership
    // (Slack-style "back to your last channel"), persisted server-side so
    // it survives logout/login.
    fetch(`/api/org/${orgId}/department/${deptId}/visit`, { method: "POST" }).catch(() => {});
  }, [orgId, deptId]);

  async function loadDocuments() {
    if (!orgId) return;
    setDocsLoading(true);
    setDocsError("");
    try {
      const res = await fetch(`/api/org/${orgId}/repository?${queryString}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Repository API is not available yet.");
      }
      const data = await res.json();
      setDocuments(data.documents || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total ?? 0);
    } catch (err) {
      setDocsError(err.message || "Failed to load documents.");
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }

  async function loadProjects() {
    if (!orgId || !deptId) return;
    setProjectsLoading(true);
    try {
      const res = await fetch(`/api/org/${orgId}/department/${deptId}/projects`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      setProjects(await res.json());
    } catch (err) {
      console.error("Failed to load department projects:", err);
    } finally {
      setProjectsLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [filters.category, filters.lifecycle, filters.fileType, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    if (tab === "documents") loadDocuments();
  }, [orgId, deptId, queryString, tab]);

  useEffect(() => {
    if (tab === "projects") loadProjects();
  }, [orgId, deptId, tab]);

  const openProject = (id) => router.push(`/project?id=${id}`);

  const handleCreateProject = async (name, description) => {
    try {
      const res = await fetch(`/api/org/${orgId}/department/${deptId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const result = await res.json();
      if (!res.ok) {
        return {
          error: true,
          message: result.message ||
            (result.error === "PROJECT_ALREADY_EXISTS"
              ? "A project with this name already exists in this department."
              : "Failed to create project."),
        };
      }
      await loadProjects();
      return { success: true };
    } catch {
      return { error: true, message: "Network error. Please try again." };
    }
  };

  const confirmDeleteProject = async (id) => {
    try {
      setProjectsLoading(true);
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const result = await res.json();
      if (res.ok && result.success) {
        await loadProjects();
      } else {
        alert(`Delete failed: ${result.error || "Unknown error"}`);
      }
    } finally {
      setProjectsLoading(false);
    }
  };

  const handleSaveEditProject = async (name, description) => {
    if (!editTarget) return;
    setIsEditingProject(true);
    try {
      const res = await fetch(`/api/projects/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(result.error || "Failed to update project");
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

  return (
    <Layout orgId={orgId}>
    <main className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {department?.name || "Department"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Documents and projects scoped to this department.
            </p>
          </div>

          {tab === "documents" ? (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Upload Document
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreateProjectModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setTab("documents")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "documents"
              ? "border-black dark:border-white text-gray-900 dark:text-gray-100"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Documents
        </button>
        <button
          type="button"
          onClick={() => setTab("projects")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "projects"
              ? "border-black dark:border-white text-gray-900 dark:text-gray-100"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Projects
        </button>
      </div>

      {tab === "documents" ? (
        <>
          <RepositoryFilters filters={filters} hideDepartmentFilter onChange={setFilters} />

          {docsError ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300">
              {docsError}
            </div>
          ) : null}

          {docsLoading ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-sm text-gray-500 dark:text-gray-400">
              Loading documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No documents found</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Upload documents or adjust filters to see this department's knowledge.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {documents.map((document) => (
                <RepositoryDocumentCard key={document.id} document={document} />
              ))}
            </div>
          )}

          {!docsLoading && documents.length > 0 && totalPages > 1 ? (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm text-gray-600 dark:text-gray-300">
              <span>Page {page} of {totalPages} ({total} documents)</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}

          <UploadToRepositoryModal
            orgId={orgId}
            userId={userId}
            fixedDepartmentId={deptId}
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            onUploaded={loadDocuments}
          />
        </>
      ) : (
        <>
          {projectsLoading ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-sm text-gray-500 dark:text-gray-400">
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                <FolderKanban className="w-8 h-8 text-gray-500 dark:text-gray-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No projects yet</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
                Create the first project for this department.
              </p>
              <button
                onClick={() => setShowCreateProjectModal(true)}
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create First Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all hover:shadow-lg overflow-hidden"
                >
                  <div className="relative p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                        <FolderKanban className="w-5 h-5 text-white" />
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
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {project.name}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm line-clamp-2">
                        {project.description || "No description provided"}
                      </p>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(project.created_at).toLocaleDateString()} · {project.user?.name || project.user?.email}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showCreateProjectModal && (
            <CreateProjectModal
              onClose={() => setShowCreateProjectModal(false)}
              onCreate={handleCreateProject}
              fixedDepartmentId={deptId}
              fixedDepartmentName={department?.name}
            />
          )}
          {deleteTarget && (
            <DeleteProjectModal
              project={deleteTarget}
              onCancel={() => setDeleteTarget(null)}
              onConfirm={async () => { await confirmDeleteProject(deleteTarget.id); setDeleteTarget(null); }}
            />
          )}
          <EditProjectModal
            isOpen={!!editTarget}
            onClose={() => setEditTarget(null)}
            onSave={handleSaveEditProject}
            project={editTarget}
            isLoading={isEditingProject}
          />
        </>
      )}
    </main>
    </Layout>
  );
}
