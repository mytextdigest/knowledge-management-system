'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot, Check, FileText, History, Loader2, MessageSquarePlus, Pencil, Scale, Send, ThumbsDown, ThumbsUp, Trash2, User, Users, X,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

const CONFIDENCE_STYLES = {
  high: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const markdownComponents = {
  h1: ({ children }) => <h3 className="mt-2 text-sm font-semibold first:mt-0 text-gray-900 dark:text-gray-100">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-2 text-sm font-semibold first:mt-0 text-gray-900 dark:text-gray-100">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-2 text-sm font-semibold first:mt-0 text-gray-900 dark:text-gray-100">{children}</h4>,
  p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-1 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-black/10 px-1 py-0.5 text-xs dark:bg-white/10">{children}</code>
  ),
};

async function streamChatResponse({ orgId, question, conversationId, scope, departmentId, onMeta, onToken, onTitle, onDone, onError }) {
  const res = await fetch(`/api/org/${orgId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, conversationId, scope, departmentId }),
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    onError(data.error || 'Failed to get a response.');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      let eventType = 'message';
      let dataLine = '';
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;

      let data;
      try {
        data = JSON.parse(dataLine);
      } catch {
        continue;
      }

      if (eventType === 'meta') onMeta(data);
      else if (eventType === 'token') onToken(data.text);
      else if (eventType === 'title') onTitle(data.title);
      else if (eventType === 'done') onDone(data);
      else if (eventType === 'error') onError(data.message);
    }
  }
}

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
  const [scope, setScope] = useState('organization');
  const [myDepartments, setMyDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState(null);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [convListOpen, setConvListOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [suggestedExperts, setSuggestedExperts] = useState([]);
  const [expertsLoading, setExpertsLoading] = useState(false);
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
        (data.messages || []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources || [],
          confidence: m.confidence,
          feedback: m.feedback || null,
        }))
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

  // Disabled along with the scope selector UI below — no need to fetch
  // "my departments" while the control that would use it is hidden.
  // useEffect(() => {
  //   if (!orgId) return;
  //   (async () => {
  //     try {
  //       const res = await fetch(`/api/org/${orgId}/department?mine=1`);
  //       const data = await res.json();
  //       const depts = Array.isArray(data) ? data : [];
  //       setMyDepartments(depts);
  //       setDepartmentId((prev) => prev ?? depts[0]?.id ?? null);
  //     } catch {
  //       setMyDepartments([]);
  //     }
  //   })();
  // }, [orgId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setError('');
    setSelectedSource(null);
    setSuggestedExperts([]);
  };

  const loadSuggestedExperts = async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestedExperts([]);
      return;
    }
    setExpertsLoading(true);
    try {
      const res = await fetch(`/api/org/${orgId}/context/experts?q=${encodeURIComponent(query)}`);
      const data = await res.json().catch(() => ({}));
      setSuggestedExperts(res.ok && Array.isArray(data.experts) ? data.experts : []);
    } catch {
      setSuggestedExperts([]);
    } finally {
      setExpertsLoading(false);
    }
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

  const submitFeedback = async (messageId, feedback) => {
    if (!conversationId || !messageId || String(messageId).startsWith('assistant-')) return;
    const current = messages.find((message) => message.id === messageId)?.feedback || null;
    const nextFeedback = current === feedback ? null : feedback;

    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, feedback: nextFeedback } : message
      )
    );

    try {
      const res = await fetch(
        `/api/org/${orgId}/chat/${conversationId}/message/${messageId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback: nextFeedback }),
        }
      );
      if (!res.ok) throw new Error('Unable to save feedback');
    } catch {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, feedback: current } : message
        )
      );
      setError('Unable to save feedback. Please try again.');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    setInput('');
    setError('');
    loadSuggestedExperts(question);

    const wasNewConversation = !conversationId;
    let activeConvId = conversationId;
    const assistantMsgId = `assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: 'user', content: question },
      { id: assistantMsgId, role: 'assistant', content: '', sources: [], confidence: null, streaming: true },
    ]);
    setSending(true);

    try {
      await streamChatResponse({
        orgId,
        question,
        conversationId,
        scope,
        departmentId: scope === 'department' ? departmentId : null,
        onMeta: ({ conversationId: newConvId, sources, confidence }) => {
          activeConvId = newConvId;
          setConversationId(newConvId);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, sources, confidence } : m))
          );
          if (wasNewConversation) loadConversations();
        },
        onToken: (text) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + text } : m))
          );
        },
        onTitle: (title) => {
          setConversations((prev) =>
            prev.map((c) => (c.id === activeConvId ? { ...c, title, preview: title } : c))
          );
        },
        onDone: ({ messageId } = {}) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, id: messageId || m.id, streaming: false, feedback: null }
                : m
            )
          );
        },
        onError: (message) => {
          setError(message === 'ORG_OPENAI_KEY_MISSING'
            ? 'This organization has no OpenAI API key configured. Ask a super admin to set one in Settings.'
            : (message || 'Failed to get a response.'));
          setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
        },
      });
    } catch {
      setError('Failed to contact the organization chat API.');
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout orgId={orgId} fullBleed>
      <div className="flex h-screen bg-white dark:bg-gray-900">
        {/* Mobile backdrop for conversation list */}
        {convListOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setConvListOpen(false)}
          />
        )}

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 w-72 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-3 transition-transform duration-200 dark:border-gray-700 dark:bg-gray-900',
            'md:static md:z-auto md:translate-x-0',
            convListOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <button
            onClick={() => { startNewConversation(); setConvListOpen(false); }}
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
                onSelect={() => { loadConversation(c.id); setConvListOpen(false); }}
                onRename={renameConversation}
                onDelete={deleteConversation}
              />
            ))}
            {conversations.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No conversations yet.</p>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-4 py-4 sm:px-6">
            <button
              onClick={() => setConvListOpen(true)}
              className="flex-shrink-0 rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 md:hidden"
              title="Conversation history"
            >
              <History className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">Chat with Organization</h1>
              <p className="truncate text-sm text-gray-500">Ask questions across your organization's knowledge repository.</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 sm:px-6">
            {(expertsLoading || suggestedExperts.length > 0) && (
              <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-800 dark:bg-indigo-950/20" aria-label="Suggested people">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                  <Users className="h-4 w-4" />
                  Suggested people to ask
                  {expertsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </div>
                {!expertsLoading && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestedExperts.map((expert) => (
                      <div key={`${expert.id}-${expert.topic}`} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs dark:border-indigo-800 dark:bg-gray-900">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{expert.name || expert.email}</p>
                        <p className="text-indigo-700 dark:text-indigo-300">{expert.topic} · score {Number(expert.score || 0).toFixed(1)}</p>
                        {expert.name && <p className="text-gray-500">{expert.email}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
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

                    <div className={cn('flex max-w-[85%] min-w-0 flex-col space-y-2 sm:max-w-[75%]', m.role === 'user' ? 'items-end' : 'items-start')}>
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-3 text-sm',
                          m.role === 'user'
                            ? 'whitespace-pre-wrap bg-blue-500 text-white'
                            : 'border border-gray-200 bg-gray-100 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
                        )}
                      >
                        {m.role === 'user' ? (
                          m.content
                        ) : m.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {m.content}
                          </ReactMarkdown>
                        ) : m.streaming ? (
                          <span className="flex items-center gap-2 text-gray-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Thinking...
                          </span>
                        ) : null}
                      </div>

                      {m.role === 'assistant' && m.confidence && (
                        <span
                          className={cn(
                            'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
                            CONFIDENCE_STYLES[m.confidence] || CONFIDENCE_STYLES.low
                          )}
                        >
                          {m.confidence} confidence
                        </span>
                      )}

                      {m.role === 'assistant' && !m.streaming && (
                        <div className="flex items-center gap-1" aria-label="Rate this answer">
                          <button
                            type="button"
                            onClick={() => submitFeedback(m.id, 'up')}
                            className={cn(
                              'rounded-md p-1.5 transition',
                              m.feedback === 'up'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                : 'text-gray-400 hover:bg-gray-100 hover:text-green-600 dark:hover:bg-gray-800'
                            )}
                            title="Helpful"
                            aria-pressed={m.feedback === 'up'}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => submitFeedback(m.id, 'down')}
                            className={cn(
                              'rounded-md p-1.5 transition',
                              m.feedback === 'down'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                : 'text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800'
                            )}
                            title="Not helpful"
                            aria-pressed={m.feedback === 'down'}
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {m.sources?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {m.sources.map((s, i) => {
                            const isDecision = s.type === 'decision';
                            const label = isDecision
                              ? s.statement
                              : [s.filename, s.department, s.project].filter(Boolean).join(' → ');
                            const className = cn(
                              'inline-flex max-w-[260px] items-center gap-1 rounded-full border px-2.5 py-1 text-xs',
                              isDecision
                                ? 'border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-400 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:border-purple-600'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-700 dark:hover:text-blue-400'
                            );

                            return (
                              <button
                                key={`${s.documentId || s.filename || 'source'}-${i}`}
                                type="button"
                                onClick={() => setSelectedSource(s)}
                                title={label}
                                className={className}
                              >
                                {isDecision ? (
                                  <Scale className="h-3 w-3 flex-shrink-0" />
                                ) : (
                                  <FileText className="h-3 w-3 flex-shrink-0" />
                                )}
                                <span className="truncate">{label || (isDecision ? 'Decision' : 'Source document')}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 sm:mx-6">
              {error}
            </div>
          )}

          <form onSubmit={sendMessage} className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 sm:px-6">
            {/* Scope selector temporarily disabled — RBAC already governs
                document access on every scope, and "Department" scope
                depends on DepartmentMember rows most org members don't have
                yet. Scope is hardcoded to 'organization' below until the
                team decides whether to keep Personal/Department. See
                REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md FR-G.
            {
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="text-gray-500 dark:text-gray-400">Search scope:</span>
                {[
                  { value: 'organization', label: 'Organization' },
                  { value: 'department', label: 'Department' },
                  { value: 'personal', label: 'Personal' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setScope(item.value)}
                    className={cn(
                      'rounded-full border px-3 py-1 transition',
                      scope === item.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
                {scope === 'department' && myDepartments.length > 1 && (
                  <select
                    value={departmentId || ''}
                    onChange={(e) => setDepartmentId(e.target.value || null)}
                    className="rounded-full border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  >
                    {myDepartments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
                {scope === 'department' && myDepartments.length === 0 && (
                  <span className="text-gray-400 dark:text-gray-500">You're not a member of any department.</span>
                )}
              </div>
            }
            */}
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

      {selectedSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {selectedSource.type === 'decision' && <Scale className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
                  {selectedSource.type === 'decision' ? 'Decision Evidence' : 'Citation Preview'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedSource.filename || 'Source document'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSource(null)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {selectedSource.type === 'decision' ? (
              <div className="mb-4 max-h-72 space-y-3 overflow-y-auto rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm text-gray-800 dark:border-purple-800 dark:bg-purple-900/10 dark:text-gray-100">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">Decision</p>
                  <p>{selectedSource.statement}</p>
                </div>
                {selectedSource.rationale && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">Rationale</p>
                    <p>{selectedSource.rationale}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-4 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                {selectedSource.preview || 'Preview text is not available for this citation.'}
              </div>
            )}

            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
              {selectedSource.department && <p>Department: {selectedSource.department}</p>}
              {selectedSource.project && <p>Project: {selectedSource.project}</p>}
            </div>

            {selectedSource.url && (
              <a
                href={selectedSource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open Source Document
              </a>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
