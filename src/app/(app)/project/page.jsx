'use client'
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Layout from '@/components/layout/Layout';
import DocumentGrid from '@/components/documents/DocumentGrid';
import FileUpload from '@/components/documents/FileUpload';
import { Modal, ModalHeader, ModalTitle, ModalContent } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Pencil } from 'lucide-react';
import { motion } from 'framer-motion';
import ChatInterface from "@/components/chat/ChatInterface";
import TwoColumnLayout from "@/components/layout/TwoColumnLayout";
import DeleteConfirmationModal from '@/components/modals/DeleteConfirmationModal';
import EditDocumentModal from '@/components/modals/EditDocumentModal';
import EditProjectModal from '@/components/modals/EditProjectModal';
import { useSession } from "next-auth/react";


function ProjectPageInner() {
  const [docs, setDocs] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [documentToRename, setDocumentToRename] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);

  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  const { data: session } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    setDocs([]);
    setProject(null);
    if (projectId) {
      loadProject();
      loadDocuments();
    }
  }, [projectId]);

  const loadProject = async () => {
    try {
      setLoading(true);
  
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      console.log("fetch project: ", res)
  
      if (!res.ok) {
        console.error('Failed to fetch project:', res.status);
        return;
      }
  
      const projectData = await res.json();
      console.log("Project Data: ", projectData)
      setProject(projectData);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  };
  

  const loadDocuments = async () => {
    try {
      setLoading(true);
  
      const res = await fetch(`/api/documents?projectId=${projectId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
  
      if (!res.ok) {
        console.error('Failed to fetch documents:', res.status);
        return;
      }
  
      const data = await res.json();
      console.log("Check visivility", data)

      setDocs(data);

      // console.log("Loaded document: ", data)
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  async function handleFileUpload(file, userId, projectId, visibility) {
    const presignRes = await fetch("/api/s3/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        userId,
        projectId,
      }),
    });
  
    const presignData = await presignRes.json();
  
    // 🔴 Handle early rejection
    if (!presignRes.ok) {
      if (presignData?.error === "DUPLICATE_FILENAME") {
        throw new Error(presignData.message || "Duplicate filename");
      }
  
      throw new Error("Failed to prepare upload");
    }
  
    const { url, fields, key } = presignData;
  
    // ✅ Safe now
    const formData = new FormData();
    Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
    formData.append("file", file);
  
    const upload = await fetch(url, { method: "POST", body: formData });
    if (!upload.ok) {
      throw new Error("S3 upload failed");
    }
  
    const ingestForm = new FormData();
    ingestForm.append("s3Key", key);
    ingestForm.append("projectId", projectId);
    ingestForm.append("visibility", visibility);
  
    const ingestRes = await fetch("/api/documents/ingest", {
      method: "POST",
      body: ingestForm,
    });
  
    if (!ingestRes.ok) {
      throw new Error("Ingestion failed");
    }
  
    await loadDocuments();
  }
  

  const handleDelete = async (id) => {
    const docToDelete = docs.find(doc => doc.id === id);
    setDocumentToDelete(docToDelete);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
  
    try {
      console.log("Document id: ", documentToDelete.id)
      const res = await fetch(`/api/documents/${documentToDelete.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
  
      if (!res.ok) {
        console.error("Failed to delete document:", res.status);
        return;
      }
  
      await loadDocuments();
      setShowDeleteModal(false);
    } catch (err) {
      console.error("Error deleting document:", err);
    } finally {
      setIsDeleting(false);
    }
  };
  

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setDocumentToDelete(null);
  };

  const handleToggleStar = async (id) => {
    try {
      const res = await fetch(`/api/documents/${id}/star`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
  
      if (!res.ok) {
        console.error("Failed to toggle star:", res.status);
        return;
      }
  
      const { starred } = await res.json();
  
      // update locally without re-fetching everything
      setDocs((prev) =>
        prev.map((doc) =>
          doc.id === id ? { ...doc, starred } : doc
        )
      );
    } catch (err) {
      console.error("Failed to toggle star:", err);
    }
  };

  const handleToggleSelect = async (id) => {
    try {
      // If running inside Electron, use the API instead of IPC
      // if (typeof window !== "undefined" && !window.api) {
      //   // Browser dev fallback (same as before)
      //   setDocuments((docs) =>
      //     docs.map((doc) =>
      //       doc.id === id ? { ...doc, selected: !doc.selected } : doc
      //     )
      //   );
      //   return;
      // }
  
      // --- API CALL (replacing the IPC handler) ---
      const res = await fetch(`/api/documents/${id}/toggle-selection`, {
        method: "POST",
      });
  
      const data = await res.json();
  
      if (!data.success) {
        console.error("Toggle selection API error:", data.error);
        return;
      }
  
      // Reload documents from server
      await loadDocuments();
    } catch (err) {
      console.error("Toggle selection failed:", err);
    }
  };

  const handleRename = (doc) => {
    setDocumentToRename(doc);
    setShowRenameModal(true);
  };

  const handleSaveRename = async (newFilename) => {
    if (!documentToRename) return;
    setIsRenaming(true);
    try {
      const res = await fetch(`/api/documents/${documentToRename.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: newFilename }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error('Rename failed:', data.error);
        return;
      }
      setDocs((prev) =>
        prev.map((d) => d.id === documentToRename.id ? { ...d, filename: newFilename } : d)
      );
      setShowRenameModal(false);
      setDocumentToRename(null);
    } catch (err) {
      console.error('Rename error:', err);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleEditProject = () => setShowEditProjectModal(true);

  const handleSaveProject = async (name, description) => {
    if (!projectId) return;
    setIsEditingProject(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error('Project update failed:', data.error);
        return;
      }
      const updated = await res.json();
      setProject(updated);
      setShowEditProjectModal(false);
    } catch (err) {
      console.error('Project update error:', err);
    } finally {
      setIsEditingProject(false);
    }
  };

  // const filteredDocs = activeFilter === 'starred' ? docs.filter(d => d.starred) : docs;

  const filteredDocs =
    activeFilter === 'starred'
      ? docs.filter(d => d.starred)
      : activeFilter === 'unselected'
      ? docs.filter(d => d.selected === 0 || d.selected === false || d.selected === null)
      : docs;

  const documentPanel = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col space-y-6 pt-2.5"
    >
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard/')}
          className="flex items-center space-x-2 text-gray-600 dark:text-gray-400"
          style={{
            '--hover-text-color': '#000000',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#000000';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '';
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Projects</span>
        </Button>
      </div>

      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {project ? project.name : `Project ${projectId}`}
          </h1>
          {project && (
            <button
              onClick={handleEditProject}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              title="Edit project name and description"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {project?.description
            ? <span>{project.description}</span>
            : <span>Manage and organize project files</span>
          }
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <DocumentGrid
          documents={filteredDocs}
          loading={loading}
          onUpload={() => setUploadModalOpen(true)}
          onView={(doc) => router.push(`/document?id=${doc.id}`)}
          onDelete={handleDelete}
          onToggleStar={handleToggleStar}
          onToggleSelect={handleToggleSelect}
          onRename={handleRename}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      </div>
    </motion.div>
  );

  const chatPanel = (
    <div className="h-full">
      <ChatInterface className="h-full" projectId={projectId} />
    </div>
  );

  return (
    <Layout>
      <div className="h-[calc(100vh-8rem)]"> 
        <TwoColumnLayout
          leftColumn={documentPanel}
          rightColumn={chatPanel}
          leftTitle="Documents"
          rightTitle="Chat"
        />
      </div>

      <Modal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        size="lg"
      >
        <ModalHeader>
          <ModalTitle>Upload Documents</ModalTitle>
        </ModalHeader>
        <ModalContent className="flex flex-col max-h-[calc(100vh-8rem)] overflow-hidden">
          <FileUpload
            onUpload={(file, visibility) => handleFileUpload(file, userId, projectId, visibility)}
            onClose={() => setUploadModalOpen(false)}
          />
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Delete Document"
        message={`Are you sure you want to delete "${documentToDelete?.filename}"? This action cannot be undone.`}
        confirmText="Delete Document"
        cancelText="Cancel"
        isLoading={isDeleting}
      />

      {/* Rename Document Modal */}
      <EditDocumentModal
        isOpen={showRenameModal}
        onClose={() => { setShowRenameModal(false); setDocumentToRename(null); }}
        onSave={handleSaveRename}
        document={documentToRename}
        isLoading={isRenaming}
      />

      {/* Edit Project Modal */}
      <EditProjectModal
        isOpen={showEditProjectModal}
        onClose={() => setShowEditProjectModal(false)}
        onSave={handleSaveProject}
        project={project}
        isLoading={isEditingProject}
      />

    </Layout>
  );
}

// Loading component for Suspense fallback
function ProjectLoading() {
  return (
    <Layout>
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading project...</p>
        </div>
      </div>
    </Layout>
  );
}

// Main component with Suspense boundary
export default function ProjectPage() {
  return (
    <Suspense fallback={<ProjectLoading />}>
      <ProjectPageInner />
    </Suspense>
  );
}
