"use client";
import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from 'framer-motion';
import AuditEventList from "@/components/governance/AuditEventList";
import DocumentVersionsPanel from "@/components/governance/DocumentVersionsPanel";
import DocumentOwnershipPanel from "@/components/governance/DocumentOwnershipPanel";
import DocumentCompletenessBadge from "@/components/governance/DocumentCompletenessBadge";
import DocumentWorkflowPanel from "@/components/governance/DocumentWorkflowPanel";
import DocumentReviewPrompt from "@/components/governance/DocumentReviewPrompt";
import DocumentLifecycleActions from "@/components/governance/DocumentLifecycleActions";
import Layout from '@/components/layout/Layout';
import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import { Button } from '@/components/ui/Button';
import { FileText, MessageCircle, AlertCircle, BarChart3, Clock, FileType, Calendar, Trash2, CheckCircle2, Copy, Check, Printer, BookOpen, ChevronDown, ChevronRight, HelpCircle, Lightbulb, Sheet, Gavel, AlertTriangle, Maximize2, Network, Info, ArrowLeft } from 'lucide-react';
import BackButton from '@/components/ui/BackButton';
import mammoth from "mammoth";
import ClearChatDialog from "@/components/documents/ClearChatDialog";
import PdfViewer from "@/components/documents/PdfViewer";
import SlideDeckViewer from "@/components/documents/SlideDeckViewer";
import FileViewerFrame from "@/components/documents/viewer/FileViewerFrame";
import { ViewerToolbarHost } from "@/components/documents/viewer/ViewerToolbar";
import { slidesFromChunks } from "@/lib/slideCitations";
import { printHtml } from "@/lib/printDocument";
import SourceTagsPanel from "@/components/documents/SourceTagsPanel";
import DocumentFullscreenModal from "@/components/documents/DocumentFullscreenModal";
import { copySummary, printSummary } from '@/lib/summaryActions';
import DocViewer, { DocViewerRenderers } from "react-doc-viewer";
import ChatMessage, { AssistantPendingRow, TypingDots } from "@/components/chat/ChatMessage";
import ChatComposer from "@/components/chat/ChatComposer";
import ExpandedMessageModal from "@/components/chat/ExpandedMessageModal";
import { useToast, ToastProvider } from "@/components/ui/Toast";
import DocumentTabs from "@/components/documents/document/DocumentTabs";
import OpenInSourceLink from '@/components/documents/OpenInSourceLink';



const WORDS_PER_PAGE = 400;

const escapeHtml = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Wraps a document body for the system print dialog (from My Text Digest).
const printableHtml = (title, body) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Georgia,serif;max-width:760px;margin:32px auto;color:#111;line-height:1.6}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}h2{font-size:16px;margin:24px 0 6px}</style>
</head><body>${body}</body></html>`;

// Signed file links from the document API last an hour; refresh them before that.
const FILE_LINK_TTL_MS = 50 * 60 * 1000;

function DocumentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const id = searchParams.get('id');
  // E11.1: a "slide 7" citation links here with &slide=7.
  const activeSlide = Number.parseInt(searchParams.get('slide') || '', 10) || null;


  const [doc, setDoc] = useState(null);
  const [docError, setDocError] = useState(null);
  const [chat, setChat] = useState([]);
  const [question, setQuestion] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'summary' | 'guide' | 'insights' | 'details' | 'versions' | 'history' | 'workflow'
  const [summary, setSummary] = useState(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const [docxHtml, setDocxHtml] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [showClearDialog, setShowClearDialog] = useState(false);

  const abortControllerRef = useRef(null);
  const currentRequestIdRef = useRef(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const [expandedMessage, setExpandedMessage] = useState(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  // The left header row's slot that viewer toolbars render into.
  const [toolbarHost, setToolbarHost] = useState(null);
  const toolbarSlot = useMemo(() => ({ host: toolbarHost }), [toolbarHost]);

  // Reading Guide state
  const [pagesRead, setPagesRead] = useState(0);
  const [readingInsights, setReadingInsights] = useState([]);
  const [isLoadingPageInsight, setIsLoadingPageInsight] = useState(false);
  const [pageInsightError, setPageInsightError] = useState(null);
  const [expandedInsightIndex, setExpandedInsightIndex] = useState(null);
  const [detectedPage, setDetectedPage] = useState(0);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const insightsEndRef = useRef(null);
  const docScrollRef = useRef(null);
  const scrollDebounceRef = useRef(null);

  const toast = useToast();

  const ext = doc?.filename?.split('.').pop().toLowerCase() ?? '';
  const isSpreadsheet = ['csv', 'xlsx', 'xls'].includes(ext);
  const canRegenerateSummary = doc?.permissions?.canRegenerate !== false;
  const canAskDocument = doc?.permissions?.canAsk !== false;
  const canClearDocumentChat = doc?.permissions?.canClearChat !== false;

  const updateProjectLinkStatus = async (linkId, status) => {
    try {
      const res = await fetch(`/api/documents/${id}/project-links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to update project suggestion");
      setDoc((current) => ({
        ...current,
        projectLinks: status === "dismissed"
          ? (current.projectLinks || []).filter((link) => link.id !== linkId)
          : (current.projectLinks || []).map((link) => link.id === linkId ? data.link : link),
      }));
      toast.success(status === "confirmed" ? "Project link confirmed" : "Project suggestion dismissed");
    } catch (error) {
      toast.error(error.message || "Unable to update project suggestion");
    }
  };

  // Derive a per-sheet breakdown from chunk metadata stored during ingestion
  // (workbookName, sheetName, rowRange, columnHeaders — see worker/extractSpreadsheet.js)
  const sheets = useMemo(() => {
    if (!isSpreadsheet || !doc?.chunks?.length) return [];

    const bySheet = new Map();
    for (const chunk of doc.chunks) {
      const meta = chunk?.metadata;
      if (!meta?.sheetName) continue;

      const existing = bySheet.get(meta.sheetName);
      if (!existing) {
        bySheet.set(meta.sheetName, {
          sheetName: meta.sheetName,
          columnHeaders: meta.columnHeaders || [],
          rowRanges: meta.rowRange ? [meta.rowRange] : [],
          previewRows: [],
        });
      } else if (meta.rowRange) {
        existing.rowRanges.push(meta.rowRange);
      }

      const target = bySheet.get(meta.sheetName);
      const headers = target.columnHeaders || [];
      const lines = String(chunk?.text || "").split("\n").filter((line) => line.includes(":") && line.includes(" | "));
      for (const line of lines) {
        if (target.previewRows.length >= 50) break;
        const cells = line.split(" | ").map((part) => {
          const idx = part.indexOf(":");
          return idx >= 0 ? part.slice(idx + 1).trim() : part.trim();
        });
        if (cells.length) target.previewRows.push(cells.slice(0, Math.max(headers.length, cells.length)));
      }
    }

    return Array.from(bySheet.values()).map((sheet) => {
      const allRows = sheet.rowRanges
        .flatMap((range) => range.split('-').map(Number))
        .filter((n) => !Number.isNaN(n));
      const rowSpan = allRows.length
        ? `${Math.min(...allRows)}-${Math.max(...allRows)}`
        : null;
      return { ...sheet, rowSpan };
    });
  }, [isSpreadsheet, doc?.chunks]);

  const totalPages = ext === 'pdf'
    ? pdfTotalPages
    : doc?.content
      ? Math.max(1, Math.ceil(doc.content.split(/\s+/).filter(Boolean).length / WORDS_PER_PAGE))
      : 0;

  const openExpanded = (message) => {
    setExpandedMessage(message);
  };
  
  const closeExpanded = () => {
    setExpandedMessage(null);
  };

  // Reading Guide helpers
  const getContentUpToPage = useCallback((pageNumber) => {
    if (!doc?.content) return '';
    const words = doc.content.split(/\s+/).filter(Boolean);
    if (ext === 'pdf') {
      const fraction = pageNumber / Math.max(1, pdfTotalPages);
      return words.slice(0, Math.ceil(words.length * fraction)).join(' ');
    }
    return words.slice(0, pageNumber * WORDS_PER_PAGE).join(' ');
  }, [doc?.content, ext, pdfTotalPages]);

  const handleMarkPageRead = useCallback(async () => {
    if (isLoadingPageInsight || pagesRead >= totalPages) return;

    const nextPage = pagesRead + 1;
    const content = getContentUpToPage(nextPage);

    if (!content?.trim()) {
      setPageInsightError('Page-wise summaries are not available because this document does not have readable text yet.');
      return;
    }

    setPageInsightError(null);
    setIsLoadingPageInsight(true);

    try {
      const response = await fetch('/api/page-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageContent: content, pageNumber: nextPage, documentId: doc?.id }),
      });

      const res = await response.json().catch(() => null);

      if (!response.ok || !res?.success) {
        throw new Error(res?.error || res?.message || 'The page insight request failed.');
      }

      const keyPoints = Array.isArray(res.keyPoints) ? res.keyPoints : [];
      const questions = Array.isArray(res.questions) ? res.questions : [];

      if (keyPoints.length === 0 && questions.length === 0) {
        setPageInsightError('No page-wise summary was generated for this page. Please try again after the document finishes processing.');
        return;
      }

      setReadingInsights(prev => [
        ...prev,
        { page: nextPage, keyPoints, questions },
      ]);
      setExpandedInsightIndex(nextPage - 1);
      setPagesRead(nextPage);
    } catch (err) {
      console.error('Failed to get page insight:', err);
      setPageInsightError('Could not generate page-wise insights right now. Please try again.');
    } finally {
      setIsLoadingPageInsight(false);
    }
  }, [isLoadingPageInsight, pagesRead, totalPages, getContentUpToPage, doc?.id]);

  // Auto-trigger chain when reading guide tab is active
  useEffect(() => {
    if (activeTab !== 'guide') return;
    if (detectedPage > pagesRead && !isLoadingPageInsight && totalPages > 0) {
      handleMarkPageRead();
    }
  }, [detectedPage, pagesRead, isLoadingPageInsight, totalPages, activeTab, handleMarkPageRead]);

  const handleDocPageChange = useCallback((pageNum) => {
    setDetectedPage(pageNum);
  }, []);

  const handleDocScroll = useCallback((e) => {
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    const el = e.currentTarget;
    scrollDebounceRef.current = setTimeout(() => {
      const pct = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      const page = Math.max(1, Math.ceil(pct * Math.max(1, totalPages)));
      setDetectedPage(page);
    }, 800);
  }, [totalPages]);

  useEffect(() => {
    insightsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [readingInsights]);



  useEffect(() => {
    if (!id) {
      router.push('/');
    }
  }, [id, router]);

  const getS3Url = (filePath) => {
    if (!filePath) return null;
    return `${process.env.NEXT_PUBLIC_S3_PUBLIC_URL}/${filePath}`;
  };

  // Fetches a document and normalizes non-document responses (401/403/404 error
  // shapes, or null) to `null` so callers never store an error object in `doc`
  // state and crash on unguarded `doc.filename.split(...)` calls downstream.
  const fetchDocument = useCallback(async (docId) => {
    const response = await fetch(`/api/documents/${docId}`, {
      method: "GET",
      credentials: "include",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.id) return null;
    return data;
  }, []);

  // Download / Open in new tab for the viewers (viewer/ViewerToolbar.jsx).
  // Reuses the links from the last load and fetches fresh ones (same access
  // check) once they're near expiry, without reloading the viewer.
  const fileLinksRef = useRef(null);
  useEffect(() => {
    fileLinksRef.current = doc?.fileUrl
      ? { fileUrl: doc.fileUrl, downloadUrl: doc.fileDownloadUrl, at: Date.now() }
      : null;
  }, [doc?.fileUrl, doc?.fileDownloadUrl]);
  const getFileLinks = useCallback(async () => {
    const cached = fileLinksRef.current;
    if (cached && Date.now() - cached.at < FILE_LINK_TTL_MS) return cached;
    const fresh = await fetchDocument(id);
    if (!fresh?.fileUrl) return cached;
    fileLinksRef.current = { fileUrl: fresh.fileUrl, downloadUrl: fresh.fileDownloadUrl, at: Date.now() };
    return fileLinksRef.current;
  }, [fetchDocument, id]);

  // Load document
  useEffect(() => {
    if (!id) return;

    const loadDoc = async () => {
      try {
        const data = await fetchDocument(id);

        if (!data) {
          setDocError("This document could not be found, or you don't have access to it.");
          return;
        }

        setDoc(data);
        void fetch(`/api/documents/${id}/interactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "view" }),
          keepalive: true,
        }).catch(() => {});

      } catch (error) {
        console.error("Error loading document:", error);
        setDocError("Something went wrong while loading this document. Please try again.");
      }
    };

    loadDoc();
  }, [id, fetchDocument]);

  // Track genuine reading time (dwell time) as an expertise signal - only
  // counts time the tab is actually visible/focused, so an idle open tab
  // doesn't count, and only reports sessions >= 15s (the server also enforces
  // this floor, plus a 20-minute-per-report ceiling, since the client can't
  // be fully trusted). Uses sendBeacon so the report survives tab close.
  useEffect(() => {
    if (!id) return;

    let accumulatedMs = 0;
    let segmentStart = document.visibilityState === "visible" ? performance.now() : null;

    function flush(isFinal = false) {
      if (segmentStart !== null) {
        accumulatedMs += performance.now() - segmentStart;
        segmentStart = document.visibilityState === "visible" ? performance.now() : null;
      }
      const seconds = Math.floor(accumulatedMs / 1000);
      if (seconds < 15) {
        if (isFinal) accumulatedMs = 0;
        return;
      }
      const payload = JSON.stringify({ type: "study_duration", durationSeconds: seconds });
      const url = `/api/documents/${id}/interactions`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
      }
      accumulatedMs = 0;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flush();
      } else {
        segmentStart = performance.now();
      }
    }

    function handlePageHide() {
      flush(true);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      flush(true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [id]);

  // Extract DOCX -> HTML
  useEffect(() => {
    if (doc?.filename?.endsWith(".docx") && doc?.fileUrl) {
      fetch(doc.fileUrl)
        .then(res => res.arrayBuffer())
        .then(buffer => mammoth.convertToHtml({ arrayBuffer: buffer }))
        .then(result => setDocxHtml(result.value))
        .catch(err => console.error("DOCX render error:", err));
    }
  }, [doc]);

  // Initialize chat with welcome message
  useEffect(() => {
    if (doc) {
      setChat([
        {
          id: `system-${Date.now()}`, // Use unique timestamp-based ID
          role: 'system',
          content: `Welcome! You can now chat about "${doc.filename}". Ask questions about the document content and I'll help you understand it better.`,
          timestamp: new Date()
        }
      ]);
    }

    if (doc && doc.summary) {
      let parsedSummary;
      try {
        parsedSummary = JSON.parse(doc.summary);
      } catch {
        parsedSummary = { overview: doc.summary, keyPoints: [] };
      }

      setSummary({
        title: doc.filename,
        overview: parsedSummary.overview,
        keyPoints: parsedSummary.keyPoints || [],
        wordCount: doc.content ? doc.content.split(" ").length : "N/A",
        estimatedReadTime: doc.content ? Math.ceil(doc.content.split(" ").length / 200) : "N/A",
        documentType: doc.filename.split(".").pop().toUpperCase(),
        lastModified: new Date().toLocaleDateString(),
      });
    }

  }, [doc]);

  useEffect(() => {
    let interval = null;
  
    const pollSummary = async () => {
      try {
        const data = await fetchDocument(id);
        if (!data) {
          clearInterval(interval);
          return;
        }

        setDoc(data);

        if (data?.summary) {
          let parsed;
          try {
            parsed = JSON.parse(data.summary);
          } catch {
            parsed = { overview: data.summary, keyPoints: [] };
          }
  
          setSummary({
            title: data.filename,
            overview: parsed.overview,
            keyPoints: parsed.keyPoints || [],
            wordCount: data.content ? data.content.split(" ").length : "N/A",
            estimatedReadTime: data.content ? Math.ceil(data.content.split(" ").length / 200) : "N/A",
            documentType: data.filename.split(".").pop().toUpperCase(),
            lastModified: new Date(data.created_at).toLocaleDateString(),
          });
  
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Error polling summary:", err);
      }
    };
  
    if (doc && !doc.summary) {
      interval = setInterval(pollSummary, 3000);
    }
  
    return () => clearInterval(interval);
  }, [id, doc, fetchDocument]);


  useEffect(() => {
    if (!doc) return;
  
    (async () => {
      try {
        // start / reuse conversation

        const startConvDocId = doc.id
        const res = await fetch(`/api/documents/${startConvDocId}/start-conversation`, {
          method: "POST",
          credentials: "include",
        }).then(r => r.json());
  
        if (res?.success) {
          setConversationId(res.conversationId);

          const convId = res.conversationId
  
          // load previous messages
          const msgsRes = await fetch(`/api/documents/messages/${convId}`, {
            method: "GET",
            credentials: "include"
          }).then(r => r.json());
  
          if (msgsRes?.success) {
            const mapped = msgsRes.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.createdAt || m.created_at)
            }));
  
            // preserve system welcome message
            setChat((prev) => {
              const systemMsg = prev.find((p) => p.role === "system") || null;
              return systemMsg ? [systemMsg, ...mapped] : mapped;
            });
          }
        }
      } catch (e) {
        console.error("Failed to start/load conversation:", e);
      }
    })();
  }, [doc]);

  // regenerate document summary
  // Generate summary when user clicks "Regenerate summary"
  const generateSummary = async () => {
    if (!doc) return;

    if (!canRegenerateSummary) {
      toast.warning("Summary regeneration is unavailable while the document is being processed. Try again once processing is complete.");
      return;
    }

    setIsGeneratingSummary(true);

    try {
      const docId = doc.id;
      const response = await fetch(`/api/documents/${docId}/regenerate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const res = await response.json().catch(() => null);

      if (!response.ok || !res?.success) {
        const message = res?.error || "Failed to queue summary regeneration.";
        toast.warning(message);
        setIsGeneratingSummary(false);
        return;
      }

      // Immediately re-fetch the doc once to get updated status
      const fresh = await fetchDocument(doc.id);
      if (!fresh) {
        toast.error("Could not refresh the document after regenerating.");
        setIsGeneratingSummary(false);
        return;
      }

      setDoc(fresh);

      // If summary already present (rare), update UI immediately
      if (fresh?.summary) {
        let parsedSummary;
        try {
          parsedSummary = JSON.parse(fresh.summary);
        } catch {
          parsedSummary = { overview: fresh.summary, keyPoints: [] };
        }

        setSummary({
          title: fresh.filename,
          overview: parsedSummary.overview,
          keyPoints: parsedSummary.keyPoints || [],
          wordCount: fresh.content ? fresh.content.split(" ").length : "N/A",
          estimatedReadTime: fresh.content ? Math.ceil(fresh.content.split(" ").length / 200) : "N/A",
          documentType: fresh.filename.split(".").pop().toUpperCase(),
          lastModified: new Date().toLocaleDateString(),
        });

        setIsGeneratingSummary(false);
        return;
      }

      // Otherwise poll until summary appears or timeout
      const pollIntervalMs = 3000;
      const maxPollSeconds = 120; // 2 minutes
      const start = Date.now();
      let summaryFound = false;

      while ((Date.now() - start) / 1000 < maxPollSeconds) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));

        const polled = await fetchDocument(doc.id);
        if (!polled) continue;

        setDoc(polled);

        if (polled?.summary) {
          let parsedSummary;
          try {
            parsedSummary = JSON.parse(polled.summary);
          } catch {
            parsedSummary = { overview: polled.summary, keyPoints: [] };
          }

          setSummary({
            title: polled.filename,
            overview: parsedSummary.overview,
            keyPoints: parsedSummary.keyPoints || [],
            wordCount: polled.content ? polled.content.split(" ").length : "N/A",
            estimatedReadTime: polled.content ? Math.ceil(polled.content.split(" ").length / 200) : "N/A",
            documentType: polled.filename.split(".").pop().toUpperCase(),
            lastModified: new Date().toLocaleDateString(),
          });

          summaryFound = true;
          break;
        }
      }

      if (!summaryFound) {
        // timed out
        setSummary({
          title: doc.filename,
          overview: "Summary generation is still in progress. Please check back in a few moments.",
          keyPoints: [],
          wordCount: doc.content ? doc.content.split(" ").length : "N/A",
          estimatedReadTime: doc.content ? Math.ceil(doc.content.split(" ").length / 200) : "N/A",
          documentType: doc.filename.split(".").pop().toUpperCase(),
          lastModified: new Date().toLocaleDateString(),
        });
      }
    } catch (error) {
      console.error("Error generating summary:", error);
      toast.error("Could not regenerate summary. Please try again.");
      setSummary({
        title: doc.filename,
        overview: "Unable to regenerate summary at this time. Please try again later.",
        keyPoints: [],
        wordCount: "N/A",
        estimatedReadTime: "N/A",
        documentType: doc.filename.split(".").pop().toUpperCase(),
        lastModified: new Date().toLocaleDateString(),
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };


  // Generate summary when switching to summary tab
  useEffect(() => {
    if (
      activeTab === "summary" &&
      doc &&
      !summary &&
      doc.status === "ready" &&
      !isGeneratingSummary
    ) {
      fetchDocument(id).then((data) => {
        if (data) setDoc(data);
      });
    }
  }, [activeTab, doc, summary, isGeneratingSummary, id, fetchDocument]);


  //  --- Asking document queries ----
  const handleAsk = async (e) => {
    e.preventDefault();
    if (!canAskDocument) {
      toast.warning("You do not have permission to chat with this document.");
      return;
    }
    if (!question.trim()) return;
  
    const userMessage = {
      id: `user-${Date.now()}-${Math.random()}`,
      role: "user",
      content: question,
      timestamp: new Date()
    };
    setChat(prev => [...prev, userMessage]);
    setQuestion("");
    setIsTyping(true);
  
    const controller = new AbortController();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
    abortControllerRef.current = controller;
    currentRequestIdRef.current = requestId;
  
    try {
      const res = await fetch(`/api/documents/${id}/ask`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question,
          conversationId,
          requestId
        })
      }).then(r => r.json());
  
      // ignore cancelled / stale responses
      if (
        controller.signal.aborted ||
        currentRequestIdRef.current !== requestId
      ) {
        return;
      }
  
      if (res?.success) {
        setChat(prev => [
          ...prev,
          {
            id: `assistant-${Date.now()}-${Math.random()}`,
            role: "assistant",
            content: res.answer,
            timestamp: new Date()
          }
        ]);
  
        if (res.conversationId && res.conversationId !== conversationId) {
          setConversationId(res.conversationId);
        }
      } else if (!res?.cancelled) {
        setChat(prev => [
          ...prev,
          {
            id: Date.now(),
            role: "assistant",
            content: `Sorry, I couldn't answer right now: ${res?.error || "unknown error"}`,
            timestamp: new Date()
          }
        ]);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setChat(prev => [
          ...prev,
          {
            id: Date.now(),
            role: "assistant",
            content: "Sorry, I encountered an error while processing your question.",
            timestamp: new Date()
          }
        ]);
      }
    } finally {
      setIsTyping(false);
      setIsCancelling(false);
      abortControllerRef.current = null;
      currentRequestIdRef.current = null;
    }
  };

  const handleCancelRequest = async () => {
    if (!currentRequestIdRef.current) return;
  
    setIsCancelling(true);
    setIsTyping(false);
  
    abortControllerRef.current?.abort();
  
    await fetch("/api/cancel", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: currentRequestIdRef.current
      })
    }).catch(() => {});
  
    abortControllerRef.current = null;
    currentRequestIdRef.current = null;
  };
  



  const onConfirmClearChat = async () => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/clear-conversation`, {
        method: "POST",
        credentials: "include"
      }).then(r => r.json());
  
      if (res?.success) {
        setConversationId(res.conversationId);
  
        setIsTyping(false);
        setQuestion("");
  
        setChat([
          {
            id: 1,
            role: "system",
            content: `Welcome! You can now chat about "${doc.filename}". Ask questions about the document content and I'll help you understand it better.`,
            timestamp: new Date(),
          },
        ]);
  
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      }
    } catch (e) {
      console.error("Failed to clear chat:", e);
    } finally {
      setShowClearDialog(false);
    }
  };
  

  const handleClearChat = () => {
    setShowClearDialog(true);
  };


  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };




  // The viewers render frameless; their toolbars portal into the left header row.
  // inModal: the fullscreen view's copy, which must not take over the page's
  // scroll tracking (docScrollRef drives the Pagewise Summary).
  const renderDocument = ({ inModal = false } = {}) => {
    if (!doc) return null;
    const scrollProps = inModal ? {} : { ref: docScrollRef, onScroll: handleDocScroll };

    const ext = doc.filename.split(".").pop().toLowerCase();
    const fileLinks = doc.fileUrl ? getFileLinks : undefined;

    // A SharePoint page (A-15) or ServiceNow article (A-17) has no file; show its text.
    if (ext === "txt" || doc.contentType === "page" || doc.contentType === "article") {
      return (
        <FileViewerFrame
          {...scrollProps}
          getFileLinks={fileLinks}
          onPrint={() => printHtml(printableHtml(doc.filename, `<pre style="white-space:pre-wrap;font:13px/1.6 ui-monospace,monospace">${escapeHtml(doc.content)}</pre>`))}
        >
          <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 p-6 font-mono text-sm leading-relaxed">
            {doc.content}
          </pre>
        </FileViewerFrame>
      );
    }

    if (ext === "pdf") {
      return (
        <div className="w-full h-full overflow-hidden">
          <PdfViewer
            fileUrl={doc.fileUrl}
            getFileLinks={fileLinks}
            filename={doc.filename}
            onPageChange={handleDocPageChange}
            onTotalPages={setPdfTotalPages}
          />
        </div>
      );
    }

    if (ext === "pptx") {
      const { slides } = slidesFromChunks(doc.chunks);
      return (
        <FileViewerFrame
          getFileLinks={fileLinks}
          onPrint={slides.length ? () => printHtml(printableHtml(doc.filename, slides.map((sl) =>
            `<h2>Slide ${sl.slide}${sl.title ? `: ${escapeHtml(sl.title)}` : ""}</h2>` +
            (sl.body ? `<p style="white-space:pre-wrap">${escapeHtml(sl.body)}</p>` : "") +
            (sl.notes ? `<p style="white-space:pre-wrap;color:#555"><em>Speaker notes:</em> ${escapeHtml(sl.notes)}</p>` : "")
          ).join(""))) : undefined}
        >
          <SlideDeckViewer chunks={doc.chunks} activeSlide={activeSlide} />
        </FileViewerFrame>
      );
    }

    if (ext === "docx") {
      return (
        <FileViewerFrame
          {...scrollProps}
          getFileLinks={fileLinks}
          onPrint={docxHtml ? () => printHtml(printableHtml(doc.filename, docxHtml)) : undefined}
        >
          <div
            className="prose prose-gray dark:prose-invert max-w-none p-6"
            dangerouslySetInnerHTML={{ __html: docxHtml || "<p>Loading...</p>" }}
          />
        </FileViewerFrame>
      );
    }

    if (["xlsx", "xls", "csv"].includes(ext)) {
      return (
        <FileViewerFrame getFileLinks={fileLinks} contentClassName="p-4 space-y-5">
          {sheets.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Spreadsheet data is still being processed. You can download the original file in the meantime.</div>
          ) : sheets.map((sheet) => (
            <div key={sheet.sheetName} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-3 py-2">
                <span className="font-semibold text-sm">{sheet.sheetName}</span>
                {sheet.rowSpan ? <span className="text-xs text-gray-500">Rows {sheet.rowSpan}</span> : null}
              </div>
              <div className="overflow-auto max-h-[360px]">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
                    <tr>{(sheet.columnHeaders || []).map((header, index) => <th key={`${header}-${index}`} className="border-b border-r border-gray-200 dark:border-gray-700 px-3 py-2 text-left font-semibold whitespace-nowrap">{header || `Column ${index + 1}`}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(sheet.previewRows || []).map((row, rowIndex) => (
                      <tr key={rowIndex} className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800/60">
                        {Array.from({ length: Math.max(sheet.columnHeaders?.length || 0, row.length) }).map((_, colIndex) => <td key={colIndex} className="border-b border-r border-gray-100 dark:border-gray-800 px-3 py-2 align-top whitespace-nowrap">{row[colIndex] ?? ""}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(sheet.previewRows || []).length === 0 ? <p className="p-3 text-xs text-gray-500">No data rows extracted for this sheet.</p> : null}
            </div>
          ))}
        </FileViewerFrame>
      );
    }

    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Unsupported file type: {ext}</p>
      </div>
    );
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  if (docError) {
    return (
      <Layout fixedHeight>
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">{docError}</p>
            <BackButton href="/welcome-back" label="Back" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!doc) {
    return (
      <Layout fixedHeight>
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading document...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const isRepositoryDoc = doc?.scope === "repository" && Boolean(doc?.orgId);
  const hasDetails = isRepositoryDoc || (doc?.sourceTags?.length ?? 0) > 0;
  const refreshDoc = () => fetchDocument(id).then((fresh) => fresh && setDoc(fresh));
  const backHref = doc?.projectId
    ? `/project?id=${doc.projectId}`
    : doc?.orgId
      ? `/org/${doc.orgId}/repository`
      : '/welcome-back';
  const notices = [
    doc?.lifecycleSuggestion === 'archived' && {
      key: 'outdated',
      body: 'May be outdated: this document has been flagged for review.',
    },
    doc?.supersededById && {
      key: 'superseded',
      body: (
        <>
          This document has been superseded.{' '}
          <a className="font-medium underline" href={`/document?id=${encodeURIComponent(doc.supersededById)}`}>Open the replacement document</a>.
        </>
      ),
    },
  ].filter(Boolean);

  // Document Preview Panel (Left Column): a header row (Back, filename, source
  // link, viewer controls) over notices and the frameless viewer. Ported from
  // My Text Digest's workspace layout; ownership, metadata and tags are in the
  // right panel's Details tab.
  const documentPanel = (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <div className="@container shrink-0 h-12 flex items-center gap-2 pl-3 pr-2 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          title={doc?.projectId ? 'Back to project' : 'Back to repository'}
          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
        <h1 className="flex-1 min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={doc.filename}>
          {doc.filename}
        </h1>
        {doc.externalUrl && (
          <div className="shrink-0">
            <OpenInSourceLink url={doc.externalUrl} sourceProvider={doc.sourceProvider} />
          </div>
        )}
        <div ref={setToolbarHost} className="shrink-0 flex items-center" />
        <button
          type="button"
          onClick={() => setIsFullscreenOpen(true)}
          title="Fullscreen"
          aria-label="Open document in fullscreen"
          className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {isRepositoryDoc && (
        <div className="shrink-0 px-3 pt-3 empty:hidden">
          <DocumentReviewPrompt orgId={doc.orgId} documentId={doc.id} />
        </div>
      )}
      {notices.map((n) => (
        <div key={n.key} role="status" className="shrink-0 flex items-center gap-2 px-3 py-2 text-sm border-b border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0">{n.body}</span>
        </div>
      ))}

      <div className="flex-1 min-h-0 overflow-hidden">
        <ViewerToolbarHost.Provider value={toolbarSlot}>
          {renderDocument()}
        </ViewerToolbarHost.Provider>
      </div>
    </div>
  );


  // Details tab (right column): document actions, ownership, metadata, source tags
  const detailsPanel = (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {isRepositoryDoc && <DocumentLifecycleActions doc={doc} onChanged={refreshDoc} />}
      {isRepositoryDoc && <DocumentOwnershipPanel documentId={doc.id} orgId={doc.orgId} />}
      {isRepositoryDoc && <DocumentCompletenessBadge documentId={doc.id} />}
      <SourceTagsPanel tags={doc?.sourceTags} />
    </div>
  );

  const insightsCount = (doc?.experts?.length || 0) + (doc?.relatedDocuments?.length || 0) + (doc?.projectLinks?.length || 0);

  const hasChatHistory = chat.some(msg => msg.role !== "system");
  const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'summary', label: 'Summary', icon: BarChart3 },
    { id: 'guide', label: 'Pagewise Summary', icon: BookOpen },
    hasDetails && { id: 'details', label: 'Details', icon: Info },
    { id: 'versions', label: 'Versions', icon: Clock },
    { id: 'history', label: 'History', icon: Clock },
    isRepositoryDoc && { id: 'workflow', label: 'Workflow', icon: CheckCircle2 },
    { id: 'insights', label: 'Insights', icon: Network, count: insightsCount },
  ].filter(Boolean);

  // Analysis Panel (Right Column): tabs (+ clear chat on the Chat tab) in a
  // header row that lines up with the document's, over the active tab; no card.
  const chatPanel = (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <div className="shrink-0 h-12 flex items-center gap-2 pl-3 pr-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex-1 min-w-0">
          <DocumentTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>
        {activeTab === 'chat' && canClearDocumentChat && (
          <button
            type="button"
            onClick={handleClearChat}
            disabled={!hasChatHistory}
            title={hasChatHistory ? "Clear chat" : "No chat to clear"}
            aria-label="Clear chat"
            className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="chat-card-content">
          {/* Content Area - Chat, Summary, or Reading Guide */}
          {activeTab === 'details' && hasDetails ? (
            detailsPanel
          ) : activeTab === 'versions' ? (
            <div className="overflow-y-auto h-full"><DocumentVersionsPanel documentId={id} /></div>
          ) : activeTab === 'workflow' && doc?.orgId ? (
            <div className="overflow-y-auto h-full"><DocumentWorkflowPanel documentId={id} orgId={doc.orgId} onLifecycleChange={() => fetchDocument(id).then((fresh) => fresh && setDoc(fresh))} /></div>
          ) : activeTab === 'history' ? (
             <div className="p-4 overflow-y-auto h-full"><AuditEventList url={id ? `/api/documents/${encodeURIComponent(id)}/history` : null} title="Document history" documentMode /></div>
           ) : activeTab === 'guide' ? (
            <div className="flex flex-col h-full">
              {/* Progress bar */}
              {totalPages > 0 && (
                <div className="shrink-0 px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>{pagesRead === 0 ? 'Not started' : `Page ${pagesRead} of ${totalPages} read`}</span>
                    <span>{Math.round((pagesRead / totalPages) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-1.5 bg-primary-600 rounded-full transition-all duration-500"
                      style={{ width: `${(pagesRead / totalPages) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Scrollable insight cards */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900/50">
                {readingInsights.length === 0 && !isLoadingPageInsight && !pageInsightError && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-3">
                    <BookOpen className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Page-wise summary mode</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[260px]">
                      Start reading or scroll through the document. Key points and reflection questions will appear automatically for each page.
                    </p>
                    {totalPages === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 max-w-[260px]">
                        Page-wise summaries will appear after readable document text is available.
                      </p>
                    )}
                  </div>
                )}

                {pageInsightError && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 px-4 py-4 flex items-start space-x-3">
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">Page-wise summary unavailable</p>
                      <p className="text-xs text-red-600 dark:text-red-400">{pageInsightError}</p>
                    </div>
                  </div>
                )}

                {readingInsights.map((insight, idx) => {
                  const isExpanded = expandedInsightIndex === idx;
                  return (
                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <button
                        onClick={() => setExpandedInsightIndex(isExpanded ? null : idx)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Page {insight.page}</span>
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-700">
                          {insight.keyPoints.length > 0 && (
                            <div className="pt-3">
                              <div className="flex items-center space-x-1.5 mb-2">
                                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Key Points</span>
                              </div>
                              <ul className="space-y-1.5">
                                {insight.keyPoints.map((point, i) => (
                                  <li key={i} className="flex items-start space-x-2">
                                    <div className="w-1.5 h-1.5 bg-primary-500 rounded-full mt-1.5 shrink-0" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{point}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {insight.questions.length > 0 && (
                            <div>
                              <div className="flex items-center space-x-1.5 mb-2">
                                <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">questions to Reflect</span>
                              </div>
                              <ol className="space-y-2">
                                {insight.questions.map((q, i) => (
                                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed pl-3 border-l-2 border-blue-200 dark:border-blue-800">{q}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {isLoadingPageInsight && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-4 flex items-start space-x-3">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Analyzing page {pagesRead + 1}…</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Extracting key points and generating reflection questions.</p>
                    </div>
                  </div>
                )}

                <div ref={insightsEndRef} />
              </div>

              {/* Status footer */}
              <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-center">
                {isLoadingPageInsight ? (
                  <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary-600" />
                    <span>Analyzing page {pagesRead + 1}…</span>
                  </div>
                ) : pageInsightError ? (
                  <p className="text-xs text-red-500 dark:text-red-400">Resolve the issue above, then scroll again to retry.</p>
                ) : pagesRead > 0 && totalPages > 0 && pagesRead >= totalPages ? (
                  <p className="text-sm text-gray-500">You&apos;ve finished the document.</p>
                ) : detectedPage > 0 ? (
                  <p className="text-xs text-gray-400">On page {detectedPage}{totalPages > 0 ? ` of ${totalPages}` : ''}</p>
                ) : totalPages === 0 ? (
                  <p className="text-xs text-gray-400">Waiting for readable document text before page-wise summaries can start.</p>
                ) : (
                  <p className="text-xs text-gray-400">Scroll through the document — insights appear automatically.</p>
                )}
              </div>
            </div>
          ) : activeTab === 'chat' ? (
            <div className="chat-container">
              <div className="chat-messages-area px-5 py-5 space-y-6 bg-white dark:bg-gray-900 chat-scrollbar">
                {chat.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onExpand={() => openExpanded(message)}
                  />
                ))}

                {isTyping && (
                  <AssistantPendingRow>
                    <TypingDots />
                  </AssistantPendingRow>
                )}

                <div ref={chatEndRef} />
              </div>

              <ChatComposer
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onSubmit={handleAsk}
                onCancel={handleCancelRequest}
                isTyping={isTyping}
                canSend={Boolean(question.trim()) && canAskDocument}
                disabled={!canAskDocument}
                placeholder="Ask about this document..."
              />
            </div>
          ) : activeTab === 'insights' ? (
            /* Insights Area - people who know this, related documents, suggested project links */
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900/50 custom-scrollbar">
              {doc?.experts?.length > 0 && (
                <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-3 text-xs dark:border-violet-900 dark:bg-violet-950/20">
                  <p className="font-semibold text-violet-900 dark:text-violet-200">People who know this</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {doc.experts.map((expert) => (
                      <a key={`${expert.id}-${expert.topicId}`} href={`mailto:${expert.email}`} className="rounded border border-violet-200 bg-white px-2 py-1 text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-gray-900 dark:text-violet-200">
                        {expert.name || expert.email} · {Number(expert.score || 0).toFixed(1)}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {doc?.relatedDocuments?.length > 0 && (
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-3 text-xs dark:border-cyan-900 dark:bg-cyan-950/20">
                  <p className="font-semibold text-cyan-900 dark:text-cyan-200">Related documents</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {doc.relatedDocuments.map((related) => (
                      <button key={related.id} type="button" onClick={() => router.push(`/document?id=${related.id}`)} className="rounded border border-cyan-200 bg-white px-2 py-1 text-cyan-800 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-gray-900 dark:text-cyan-200">
                        <span className="font-medium">{related.filename} · {Math.round(Number(related.weight || 0) * 100)}%</span>
                        <span className="ml-1 opacity-75">· {String(related.type || "related").replaceAll("_", " ")}{related.evidence?.projectContext ? " · Same project" : ""}{related.evidence?.topicOverlap ? " · Shared topic" : ""}{related.evidence?.sharedEntities?.length ? ` · ${related.evidence.sharedEntities.length} shared entities` : ""}{related.evidence?.lessonEvidence ? " · Lesson/decision context" : ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {doc?.projectLinks?.length > 0 && (
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-3 text-xs dark:border-cyan-900 dark:bg-cyan-950/20">
                  <p className="font-semibold text-cyan-900 dark:text-cyan-200">Suggested project links</p>
                  <div className="mt-2 space-y-1.5">
                    {doc.projectLinks.map((link) => (
                      <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-cyan-200 bg-white px-2 py-1.5 dark:border-cyan-800 dark:bg-gray-900">
                        <span className="text-cyan-800 dark:text-cyan-300">
                          {link.project?.name}
                          {link.status === "confirmed" && <span className="ml-1 text-green-600">Confirmed</span>}
                        </span>
                        {link.status === "suggested" && (
                          <span className="flex gap-1">
                            <button type="button" onClick={() => updateProjectLinkStatus(link.id, "confirmed")} className="rounded bg-green-600 px-2 py-1 text-white hover:bg-green-700">Confirm</button>
                            <button type="button" onClick={() => updateProjectLinkStatus(link.id, "dismissed")} className="rounded border border-gray-300 px-2 py-1 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300">Dismiss</button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insightsCount === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-2">
                  <Network className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No experts, related documents, or suggested links yet.</p>
                </div>
              )}
            </div>
          ) : (
            /* Summary Area */
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900/50 custom-scrollbar">
              {/* CASE 1: Generating */}
              {doc?.status === "summarizing" || isGeneratingSummary ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">
                      Generating summary please wait
                      {/* Generating summary in background... */}
                    </p>
                  </div>
                </div>
              ) : /* CASE 2: Ready */ summary ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-6"
                >
                  {/* Document Info */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Document Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center space-x-2">
                        <FileType className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-600 dark:text-gray-400">
                          Type:
                        </span>
                        <span className="font-medium">
                          {summary.documentType}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-600 dark:text-gray-400">
                          Words:
                        </span>
                        <span className="font-medium">{summary.wordCount}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-600 dark:text-gray-400">
                          Read Time:
                        </span>
                        <span className="font-medium">
                          {summary.estimatedReadTime} min
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-600 dark:text-gray-400">
                          Modified:
                        </span>
                        <span className="font-medium">
                          {summary.lastModified}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sheets Breakdown (spreadsheet documents only) */}
                  {isSpreadsheet && sheets.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                        <Sheet className="h-4 w-4 text-gray-500" />
                        <span>Sheets ({sheets.length})</span>
                      </h3>
                      <div className="space-y-3">
                        {sheets.map((sheet) => (
                          <div
                            key={sheet.sheetName}
                            className="rounded-md border border-gray-200 dark:border-gray-700 p-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                                {sheet.sheetName}
                              </span>
                              {sheet.rowSpan && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  Rows {sheet.rowSpan}
                                </span>
                              )}
                            </div>
                            {sheet.columnHeaders.length > 0 && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                                Columns: {sheet.columnHeaders.join(', ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Overview */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex flex-wrap items-center gap-2">
                      Summary
                      {/* E19: AI content is labelled; "pending review" until a reviewer approves this text. */}
                      {doc?.summaryStatus === 'pending' && <span className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">AI-generated · pending review</span>}
                      {doc?.summaryStatus === 'approved' && <span className="rounded-full border border-green-400 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200">AI-generated · reviewed</span>}
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                      {summary.overview}
                    </p>
                  </div>

                  {/* Key Points */}
                  {summary.keyPoints.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Key Points
                      </h3>
                      <ul className="space-y-2">
                        {summary.keyPoints.map((point, index) => (
                          <li
                            key={index}
                            className="flex items-start space-x-2"
                          >
                            <div className="w-2 h-2 bg-primary-600 rounded-full mt-2 flex-shrink-0"></div>
                            <span className="text-gray-700 dark:text-gray-300 text-sm">
                              {point}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Tracked Decisions (FR-P2-6) */}
                  {doc?.decisions?.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                        <Gavel className="h-4 w-4 text-gray-500" />
                        <span>Decisions</span>
                      </h3>
                      <div className="space-y-3">
                        {doc.decisions.map((decision) => (
                          <div
                            key={decision.id}
                            className="rounded-md border border-gray-200 dark:border-gray-700 p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {decision.statement}
                              </p>
                              {decision.decidedAt && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                  {new Date(decision.decidedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {decision.rationale && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                                <span className="font-medium">Why: </span>
                                {decision.rationale}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detected Conflicts (FR-P2-10) */}
                  {doc?.conflicts?.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <span>Conflicts</span>
                      </h3>
                      <div className="space-y-3">
                        {doc.conflicts.map((conflict) => (
                          <div
                            key={conflict.id}
                            className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Conflicts with{" "}
                                <span className="font-semibold">
                                  {conflict.otherDocument?.filename || "another document"}
                                </span>
                              </p>
                              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap capitalize">
                                {conflict.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                              {conflict.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Regenerate / Copy / Print */}
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={generateSummary}
                      disabled={!canRegenerateSummary || isGeneratingSummary}
                      className="flex items-center space-x-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span>Regenerate Summary</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        await copySummary(summary, { sheets, isSpreadsheet });
                        setSummaryCopied(true);
                        setTimeout(() => setSummaryCopied(false), 2000);
                      }}
                      className="flex items-center space-x-2"
                    >
                      {summaryCopied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      <span>{summaryCopied ? "Copied" : "Copy"}</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => printSummary(summary, { sheets, isSpreadsheet })}
                      className="flex items-center space-x-2"
                    >
                      <Printer className="h-4 w-4" />
                      <span>Print</span>
                    </Button>
                  </div>
                </motion.div>
              ) : /* CASE 3: Error */ doc?.status === "error" ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Failed to generate summary
                    </p>
                    <Button
                      onClick={generateSummary}
                      disabled={!canRegenerateSummary || isGeneratingSummary}
                      className="flex items-center space-x-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span>Try Again</span>
                    </Button>
                  </div>
                </div>
              ) : (
                /* CASE 4: No summary yet */
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      No summary available
                    </p>
                    <Button
                      onClick={generateSummary}
                      disabled={!canRegenerateSummary || isGeneratingSummary}
                      className="flex items-center space-x-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span>Generate Summary</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  );

  return (
    <Layout orgId={doc?.orgId} fixedHeight fullBleed>
      <div className="flex-1 min-h-0">
        <TwoColumnLayout
          leftColumn={documentPanel}
          rightColumn={chatPanel}
          leftTitle="Document"
          rightTitle="Chat"
          resizable="document"
          minDesktopWidth={1280}
        />
      </div>
      {showClearDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <ClearChatDialog
            open={showClearDialog}
            onConfirm={onConfirmClearChat}
            onClose={() => setShowClearDialog(false)}
          />
        </div>
      )}

      <ExpandedMessageModal
        open={!!expandedMessage}
        message={expandedMessage}
        onClose={closeExpanded}
      />

      <DocumentFullscreenModal
        open={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
        doc={doc}
        ext={ext}
        docxHtml={docxHtml}
      >
        {isFullscreenOpen && !['pdf', 'txt', 'docx'].includes(ext) ? renderDocument({ inModal: true }) : null}
      </DocumentFullscreenModal>
    </Layout>
  );
}


export default function DocumentPage() {
  return (
    <ToastProvider>
      <Suspense fallback={<div>Loading document...</div>}>
        <DocumentContent />
      </Suspense>
    </ToastProvider>
  );
}


