'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const FIELD_CLASS =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 resize-none';

const emptyForm = {
  topic: '',
  whatHappened: '',
  whatWorked: '',
  whatDidntWork: '',
  recommendation: '',
};

// Rank 11 FR-2: manual lesson capture — a short form, not a heavyweight
// wizard, so the activation energy for writing one down stays low. Shared by
// both the project and department Lessons panels; also used to edit an
// existing lesson (isEditing) rather than duplicating a second form.
export default function LessonFormModal({ isOpen, onClose, onSave, lesson = null, isSaving = false }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const isEditing = Boolean(lesson);

  useEffect(() => {
    if (isOpen) {
      setForm(
        lesson
          ? {
              topic: lesson.topic || '',
              whatHappened: lesson.whatHappened || '',
              whatWorked: lesson.whatWorked || '',
              whatDidntWork: lesson.whatDidntWork || '',
              recommendation: lesson.recommendation || '',
            }
          : emptyForm
      );
      setError('');
    }
  }, [isOpen, lesson]);

  const handleSubmit = (status) => (e) => {
    e.preventDefault();
    if (!form.whatHappened.trim()) {
      setError('Describe what happened before saving.');
      return;
    }
    onSave({ ...form, status });
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isSaving) onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            disabled={isSaving}
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>

          <div className="p-6">
            <h3 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              {isEditing ? 'Edit Lesson' : 'Capture a Lesson'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              What happened, what worked, and what you'd do differently next time.
            </p>

            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Topic
                </label>
                <Input
                  type="text"
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                  placeholder="e.g. Vendor onboarding, Q1 launch"
                  disabled={isSaving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  What happened *
                </label>
                <textarea
                  value={form.whatHappened}
                  onChange={(e) => {
                    setForm({ ...form, whatHappened: e.target.value });
                    setError('');
                  }}
                  placeholder="Describe the situation or outcome"
                  disabled={isSaving}
                  rows={3}
                  className={FIELD_CLASS}
                />
                {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  What worked
                </label>
                <textarea
                  value={form.whatWorked}
                  onChange={(e) => setForm({ ...form, whatWorked: e.target.value })}
                  placeholder="Optional"
                  disabled={isSaving}
                  rows={2}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  What didn't work
                </label>
                <textarea
                  value={form.whatDidntWork}
                  onChange={(e) => setForm({ ...form, whatDidntWork: e.target.value })}
                  placeholder="Optional"
                  disabled={isSaving}
                  rows={2}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Recommendation for next time
                </label>
                <textarea
                  value={form.recommendation}
                  onChange={(e) => setForm({ ...form, recommendation: e.target.value })}
                  placeholder="Optional"
                  disabled={isSaving}
                  rows={2}
                  className={FIELD_CLASS}
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="button" variant="outline" onClick={handleSubmit('draft')} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save as Draft'}
                </Button>
                <Button type="button" onClick={handleSubmit('published')} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Publish'}
                </Button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
