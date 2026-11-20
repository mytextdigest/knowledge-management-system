'use client';
import { motion } from 'framer-motion';
import CreateOrgForm from './CreateOrgForm';

export default function CreateOrgModal({ onClose, onCreate }) {
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

        <CreateOrgForm
          onSuccess={(org) => {
            onCreate(org);
            onClose();
          }}
        />

        <button
          onClick={onClose}
          className="mt-3 w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}
