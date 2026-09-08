'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Lightbulb, ChevronDown, ChevronUp, Plus, Pencil, Trash2, CheckCircle2, Loader2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import LessonFormModal from '@/components/lessons/LessonFormModal';

function StatusBadge({ status }) {
  const isPublished = status === 'published';
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isPublished
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      }`}
    >
      {isPublished ? 'Published' : 'Draft'}
    </span>
  );
}

function LessonCard({ lesson, onEdit, onDelete, onPublish, isBusy }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = lesson.whatWorked || lesson.whatDidntWork || lesson.recommendation;
  const hasActions = lesson.canEdit || lesson.canPublish;

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {lesson.topic || 'Untitled lesson'}
        </span>
        <StatusBadge status={lesson.status} />
      </div>
      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{lesson.whatHappened}</p>

      {expanded && (
        <div className="mt-2 space-y-1.5 text-sm">
          {lesson.whatWorked && (
            <p className="text-gray-600 dark:text-gray-300">
              <span className="font-medium text-gray-700 dark:text-gray-200">What worked: </span>
              {lesson.whatWorked}
            </p>
          )}
          {lesson.whatDidntWork && (
            <p className="text-gray-600 dark:text-gray-300">
              <span className="font-medium text-gray-700 dark:text-gray-200">What didn't work: </span>
              {lesson.whatDidntWork}
            </p>
          )}
          {lesson.recommendation && (
            <p className="text-gray-600 dark:text-gray-300">
              <span className="font-medium text-gray-700 dark:text-gray-200">Recommendation: </span>
              {lesson.recommendation}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <span>{lesson.authorName}</span>
        <span>&middot;</span>
        <span>{new Date(lesson.createdAt).toLocaleDateString()}</span>
        {lesson.projectName && (
          <>
            <span>&middot;</span>
            <span>{lesson.projectName}</span>
          </>
        )}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {hasActions && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {lesson.status === 'draft' && lesson.canPublish && (
            <Button
              type="button"
              size="sm"
              variant="success"
              onClick={() => onPublish(lesson)}
              disabled={isBusy}
              title="Publish — department admin / project owner only"
              className="gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Publish
            </Button>
          )}
          {lesson.canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onEdit(lesson)}
              disabled={isBusy}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          {lesson.canEdit && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => onDelete(lesson)}
              disabled={isBusy}
              className="gap-1.5"
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Rank 11 FR-2/FR-5: manual lesson capture + browsable feed. Drop-in on both
 * the project page (as a collapsible card, matching the Timeline panel's
 * visual language) and the department page (as a full tab body via
 * `embedded`). Talks to whichever REST base is passed in (project- or
 * department-scoped lessons route) — identical response shape either way.
 */
export default function LessonsPanel({ apiBase, embedded = false, defaultOpen = false }) {
  const [lessons, setLessons] = useState([]);
  const [canContribute, setCanContribute] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(embedded || defaultOpen);
  const [formOpen, setFormOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiBase);
      if (!res.ok) throw new Error('Failed to load lessons');
      const data = await res.json();
      setLessons(Array.isArray(data.lessons) ? data.lessons : []);
      setCanContribute(Boolean(data.canContribute));
      setCanPublish(Boolean(data.canPublish));
    } catch (err) {
      console.error('Failed to load lessons:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(form) {
    setSaving(true);
    setError('');
    try {
      const isEditing = Boolean(editingLesson);
      const url = isEditing ? `${apiBase}/${editingLesson.id}` : apiBase;
      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save lesson');

      setLessons((prev) =>
        isEditing ? prev.map((l) => (l.id === data.id ? data : l)) : [data, ...prev]
      );
      setFormOpen(false);
      setEditingLesson(null);
    } catch (err) {
      setError(err.message || 'Failed to save lesson');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(lesson) {
    setBusyId(lesson.id);
    try {
      const res = await fetch(`${apiBase}/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to publish lesson');
      setLessons((prev) => prev.map((l) => (l.id === data.id ? data : l)));
    } catch (err) {
      setError(err.message || 'Failed to publish lesson');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(lesson) {
    setBusyId(lesson.id);
    try {
      const res = await fetch(`${apiBase}/${lesson.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete lesson');
      }
      setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
    } catch (err) {
      setError(err.message || 'Failed to delete lesson');
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  const addButton = canContribute && (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        setEditingLesson(null);
        setFormOpen(true);
      }}
      className="gap-1.5"
    >
      <Plus className="h-3.5 w-3.5" />
      Add Lesson
    </Button>
  );

  const body = (
    <>
      {error && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <p className="px-1 py-4 text-sm text-gray-500 dark:text-gray-400">Loading lessons...</p>
      ) : lessons.length === 0 ? (
        <div className={embedded ? 'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center' : 'py-4 text-center'}>
          {embedded && (
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <Lightbulb className="w-8 h-8 text-gray-500 dark:text-gray-400" />
            </div>
          )}
          <h2 className={embedded ? 'text-lg font-semibold text-gray-900 dark:text-gray-100' : 'text-sm font-medium text-gray-700 dark:text-gray-300'}>
            No lessons captured yet
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {canContribute ? 'Capture what worked and what to do differently next time.' : 'Nothing has been captured here yet.'}
          </p>
        </div>
      ) : (
        <ul className={embedded ? 'divide-y divide-gray-200 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800' : 'divide-y divide-gray-100 dark:divide-gray-700'}>
          {lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              isBusy={busyId === lesson.id}
              onEdit={(l) => {
                setEditingLesson(l);
                setFormOpen(true);
              }}
              onDelete={(l) => setConfirmDelete(l)}
              onPublish={handlePublish}
            />
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div>
      {embedded ? (
        <div className="space-y-3">
          <div className="flex items-center justify-end">{addButton}</div>
          {body}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Lessons Learned {lessons.length > 0 ? `(${lessons.length})` : ''}
            </span>
            <span className="flex items-center gap-2">
              {open ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </span>
          </button>

          {open && (
            <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
              <div className="mb-3 flex items-center justify-end">{addButton}</div>
              {body}
            </div>
          )}
        </div>
      )}

      <LessonFormModal
        isOpen={formOpen}
        onClose={() => {
          if (!saving) {
            setFormOpen(false);
            setEditingLesson(null);
          }
        }}
        onSave={handleSave}
        lesson={editingLesson}
        canPublish={canPublish}
        isSaving={saving}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete this lesson?</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This can't be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)} disabled={busyId === confirmDelete.id}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={() => handleDelete(confirmDelete)} disabled={busyId === confirmDelete.id}>
                {busyId === confirmDelete.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
