'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

// Renders a chat message's raw text as markdown (bold, short lists, etc. now that the
// system prompts are allowed to use light formatting instead of being told "plain text
// only, no markdown" — ported from My Text Digest, workspace UI redesign 554e6b6). Previously every
// surface rendered message.content as inert whitespace-pre-wrap text, so any markdown
// the model emitted anyway (mainly **bold**) showed up as literal asterisks.
//
// Citations (project chat only) used to be handled by splitting the raw string on each
// cited filename and wrapping matches in a clickable button. That doesn't compose with
// a markdown parser, so instead we rewrite each filename occurrence into a real
// markdown link — `[filename](citation:<index>)` — before parsing, then intercept that
// synthetic scheme in the `a` component override below.
function linkifyCitations(content, citations) {
  const names = (citations || []).map((c) => c.filename).filter(Boolean);
  if (!names.length) return content;

  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g');

  return content.replace(pattern, (match) => {
    const index = citations.findIndex((c) => c.filename === match);
    return index === -1 ? match : `[${match}](citation:${index})`;
  });
}

// E11.5 (KMS): on a recording's page, times in an answer ("at 12:34") become
// buttons that play the recording from there. Rewritten to `#seek-<seconds>`
// links before parsing (a fragment, which react-markdown keeps), intercepted
// in the `a` override. Times past the recording's end are left as text.
const TIME_PATTERN = /(?<![\d:.A-Za-z])((?:\d{1,2}:)?\d{1,2}:\d{2})(?![\d:])/g;

function linkifyTimes(content, maxSeconds) {
  return content.replace(TIME_PATTERN, (match) => {
    const seconds = match.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    if (Number.isFinite(maxSeconds) && seconds > maxSeconds + 1) return match;
    return `[${match}](#seek-${seconds})`;
  });
}

function isBoldOnlyParagraph(node) {
  // Ignore whitespace and a trailing colon outside the bold ("**Key Insights**:").
  const kids = (node?.children || []).filter((c) => !(c.type === 'text' && /^\s*:?\s*$/.test(c.value)));
  return kids.length === 1 && kids[0].type === 'element' && kids[0].tagName === 'strong';
}

// variant="rich" (assistant answers in chat) renders headings as real headings
// and gives nested lists their own bullet style; the default keeps headings as
// bold lines for compact surfaces.
export default function MarkdownMessage({ content, citations, onCitationClick, onTimestampClick, maxSeconds, className, variant }) {
  const cited = linkifyCitations(content || '', citations);
  const text = onTimestampClick ? linkifyTimes(cited, maxSeconds) : cited;
  const rich = variant === 'rich';

  return (
    <div className={cn(
      'text-sm leading-relaxed break-words overflow-wrap-anywhere',
      rich && '[&_ul_ul]:list-[circle] [&_ul_ul]:mt-1 [&_li>p]:mb-1',
      className
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, children }) => {
            // Models often write a section title as a bold line ("**Key Insights:**")
            // rather than a markdown heading — show those as headings too.
            if (rich && isBoldOnlyParagraph(node)) {
              return <h4 className="text-base font-semibold mt-4 mb-2 first:mt-0 [&_strong]:font-semibold">{children}</h4>;
            }
            return <p className={cn("whitespace-pre-wrap last:mb-0", rich ? "mb-3" : "mb-2")}>{children}</p>;
          },
          ul: ({ children }) => <ul className={cn("list-disc pl-5 last:mb-0", rich ? "mb-3 space-y-1.5 marker:text-gray-400" : "mb-2 space-y-1")}>{children}</ul>,
          ol: ({ children }) => <ol className={cn("list-decimal pl-5 last:mb-0", rich ? "mb-3 space-y-1.5 marker:text-gray-500" : "mb-2 space-y-1")}>{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[0.85em]">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-current/30 pl-3 italic opacity-90 mb-2 last:mb-0">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => rich
            ? <h3 className="text-xl font-semibold mt-5 mb-2 first:mt-0">{children}</h3>
            : <p className="font-semibold mb-1">{children}</p>,
          h2: ({ children }) => rich
            ? <h3 className="text-lg font-semibold mt-5 mb-2 first:mt-0">{children}</h3>
            : <p className="font-semibold mb-1">{children}</p>,
          h3: ({ children }) => rich
            ? <h4 className="text-lg font-semibold mt-4 mb-2 first:mt-0">{children}</h4>
            : <p className="font-semibold mb-1">{children}</p>,
          a: ({ href, children }) => {
            if (onTimestampClick && href?.startsWith('#seek-')) {
              const seconds = Number(href.slice('#seek-'.length));
              return (
                <button
                  type="button"
                  onClick={() => onTimestampClick(seconds)}
                  title="Play from here"
                  className="inline-flex items-center rounded bg-blue-50 px-1 font-medium tabular-nums text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/70"
                >
                  {children}
                </button>
              );
            }
            if (href?.startsWith('citation:')) {
              const index = Number(href.slice('citation:'.length));
              const citation = citations?.[index];
              if (!citation || !onCitationClick) return <>{children}</>;
              return (
                <button
                  type="button"
                  onClick={() => onCitationClick(citation)}
                  className="font-medium underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600 dark:hover:text-blue-400">
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
