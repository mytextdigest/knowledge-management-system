import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const EditDocumentModal = ({ isOpen, onClose, onSave, document, isLoading = false }) => {
  const [filename, setFilename] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (document) {
      setFilename(document.filename || '');
    }
  }, [document]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!filename.trim()) {
      newErrors.filename = 'Filename is required';
    }

    if (filename.trim() && !filename.includes('.')) {
      newErrors.filename = 'Filename must include an extension (e.g., .txt, .pdf, .docx)';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave(filename.trim());
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isLoading) onClose();
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
          className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            disabled={isLoading}
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>

          <div className="p-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
              Rename Document
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filename *
                </label>
                <Input
                  type="text"
                  value={filename}
                  onChange={(e) => {
                    setFilename(e.target.value);
                    setErrors({ ...errors, filename: '' });
                  }}
                  placeholder="document.pdf"
                  disabled={isLoading}
                  className={errors.filename ? 'border-red-500' : ''}
                />
                {errors.filename && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.filename}</p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Include the file extension (e.g., .txt, .pdf, .docx)
                </p>
              </div>

              <div className="flex space-x-3 pt-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </div>
                  ) : (
                    'Rename'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EditDocumentModal;
