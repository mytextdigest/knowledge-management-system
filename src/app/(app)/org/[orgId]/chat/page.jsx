'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Check, FileText, Loader2, MessageSquarePlus, Pencil, Send, Trash2, User, X,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

function ConversationRow({ conversation, active, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [title, setTitle] = useState(conversation.preview);

  const submitRename = () => {
    const trimmed = title.trim();
    setEditing(false);
    if (trimmed && trimmed !== conversation.preview) onRename(conversation.id, trimmed);
    else setTitle(conversation.preview);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename();
            if (e.key === 'Escape') { setTitle(conversation.preview); setEditing(false); }
          }}
          className="w-full rounded-md border border-blue-400 bg-white px-2 py-1 text-sm text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100"
        />
        <button onClick={submitRename} className="rounded p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { setTitle(conversation.preview); setEditing(false); }} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs dark:bg-red-900/20">
        <span className="text-red-700 dark:text-red-300">Delete this chat?</span>
        <div className="flex gap-1">
          <button
            onClick={() => onDelete(conversation.id)}
            className="rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmingDelete(false)}
            className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-sm',
        active
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
      )}
    >
      <button onClick={onSelect} className="min-w-0 flex-1 truncate text-left">
        {conversation.preview}
      </button>
      <button
        onClick={() => setEditing(true)}
        className="flex-shrink-0 rounded p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700"
        title="Rename"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setConfirmingDelete(true)}
        className="flex-shrink-0 rounded p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function OrgChatPage() {
  const { orgId } = useParams();

  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  const loadConversations = async () => {
    try {
      const res = await fetch(`/api/org/${orgId}/chat`);
      const data = await res.json();
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch {
      setConversations([]);
    }
  };

  const loadConversation = async (id) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/org/${orgId}/chat/${id}`);
      const data = await res.json();
      if (!res.ok) return;
      setMessages(
        (data.messages || []).map((m) => ({ id: m.id, role: m.role, content: m.content }))
      );
      setConversationId(id);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!orgId) return;
    loadConversations().finally(() => setLoadingHistory(false));
  }, [orgId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setError('');
  };

  const renameConversation = async (id, title) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, preview: title, title } : c)));
    try {
      await fetch(`/api/org/${orgId}/chat/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    } catch {
      loadConversations();
    }
  };

  const deleteConversation = async (id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (conversationId === id) startNewConversation();
    try {
      await fetch(`/api/org/${orgId}/chat/${id}`, { method: 'DELETE' });
    } catch {
      loadConversations();
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    setInput('');
    setError('');
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: question }]);
    setSending(true);

    try {
      const res = await fetch(`/api/org/${orgId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversationId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error === 'ORG_OPENAI_KEY_MISSING'
          ? 'This organization has no OpenAI API key configured. Ask a super admin to set one in Settings.'
          : (data.error || 'Failed to get a response.'));
        return;
      }

      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { id: `assistant-${Date.now()}`, role: 'assistant', content: data.answer, sources: data.sources },
      ]);

      const isNew = !conversationId;
      if (isNew) loadConversations();
    } catch {
      setError('Failed to contact the organization chat API.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout orgId={orgId} fullBleed>
      <div className="flex h-screen bg-white dark:bg-gray-900">
        <aside className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-3">
          <button
            onClick={startNewConversation}
            className="mb-3 flex w-full items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New Conversation
          </button>

          <div className="space-y-0.5">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={conversationId === c.id}
                onSelect={() => loadConversation(c.id)}
                onRename={renameConversation}
                onDelete={deleteConversation}
              />
            ))}
            {conversations.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No conversations yet.</p>
            )}
          </div>
        </aside>

        <main className="flex flex-1 flex-col">
          <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Chat with Organization</h1>
            <p className="text-sm text-gray-500">Ask questions across your organization's knowledge repository.</p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {loadingHistory ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                No messages yet. Ask something about your organization's documents.
              </div>
            ) : (
              <AnimatePresence>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn('flex items-start gap-3', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                        m.role === 'user' ? 'bg-blue-500' : 'bg-purple-500'
                      )}
                    >
                      {m.role === 'user' ? (
                        <User className="h-4 w-4 text-white" />
                      ) : (
                        <Bot className="h-4 w-4 text-white" />
                      )}
                    </div>

                    <div className={cn('max-w-[75%] space-y-2', m.role === 'user' ? 'items-end' : 'items-start')}>
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
                          m.role === 'user'
                            ? 'bg-blue-500 text-white'
                            : 'border border-gray-200 bg-gray-100 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
                        )}
                      >
                        {m.content}
                      </div>

                      {m.sources?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {m.sources.map((s, i) => {
                            const label = [s.filename, s.department, s.project]
                              .filter(Boolean)
                              .join(' → ');
                            const className =
                              'inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-700 dark:hover:text-blue-400';

                            return s.url ? (
                              <a
                                key={i}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={className}
                              >
                                <FileText className="h-3 w-3" />
                                {label}
                              </a>
                            ) : (
                              <span key={i} className={className}>
                                <FileText className="h-3 w-3" />
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            {sending && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="mx-6 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              {error}
            </div>
          )}

          <form onSubmit={sendMessage} className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your organization's knowledge..."
                disabled={sending}
                className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="rounded-md bg-blue-600 p-2 text-white disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </main>
      </div>
    </Layout>
  );
}
