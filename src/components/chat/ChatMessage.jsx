'use client'
import { motion } from 'framer-motion';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import MessageActions from './MessageActions';
import MarkdownMessage from './MarkdownMessage';

// One chat message (document chat). Ported from My Text Digest's ChatMessage
// (workspace UI redesign, 554e6b6) without its image, chart, table and
// comparison parts, which KMS doesn't have; 👍/👎 waits for the feedback
// columns (docs/DOCUMENT_PAGE_WORKSPACE_UI_PLAN.md).
// User messages: light bubble on the right with the send time underneath.
// Assistant (and system welcome) messages: markdown beside a neutral avatar,
// no bubble, followed by `children` (e.g. source chips) and the action row.

export function AssistantAvatar() {
  return (
    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-violet-50 text-violet-600 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30">
      <Bot className="w-4 h-4" />
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-primary-600 text-white">
      <User className="w-4 h-4" />
    </div>
  );
}

const formatTime = (t) => {
  const d = t instanceof Date ? t : t ? new Date(t) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
};

const rowMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: 'easeOut' },
};

export default function ChatMessage({ message, onExpand, onCitationClick, onTimestampClick, maxSeconds, children }) {
  if (message.role === 'user') {
    const time = formatTime(message.timestamp);
    return (
      <motion.div {...rowMotion} className="group flex items-start justify-end gap-3">
        <div className="flex flex-col items-end min-w-0 max-w-[85%]">
          {message.content && (
            <div className="rounded-2xl rounded-tr-md px-4 py-2.5 bg-primary-50 text-gray-900 dark:bg-primary-500/15 dark:text-gray-100 overflow-hidden">
              <MarkdownMessage content={message.content} />
            </div>
          )}
          {/* Time, with the actions appearing beside it on hover — no extra row in the thread. */}
          <div className="mt-1 flex items-center gap-2 h-8">
            {message.content && (
              <MessageActions
                content={message.content}
                onExpand={onExpand}
                align="right"
                className="mt-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
              />
            )}
            {time && <span className="text-[11px] text-gray-400 dark:text-gray-500">{time}</span>}
          </div>
        </div>
        <UserAvatar />
      </motion.div>
    );
  }

  const isSystem = message.role === 'system';
  return (
    <motion.div {...rowMotion} className="flex items-start gap-3">
      <AssistantAvatar />
      <div className="flex-1 min-w-0 flex flex-col items-start pt-1 text-gray-800 dark:text-gray-100">
        <MarkdownMessage
          variant="rich"
          content={message.content}
          citations={message.citations}
          onCitationClick={onCitationClick}
          onTimestampClick={isSystem ? undefined : onTimestampClick}
          maxSeconds={maxSeconds}
          className={cn('w-full text-[15px]', isSystem && 'text-gray-500 dark:text-gray-400')}
        />

        {children}

        {message.content && !isSystem && (
          <MessageActions content={message.content} onExpand={onExpand} className="mt-3" />
        )}
      </div>
    </motion.div>
  );
}

// Assistant-side row for transient states (typing dots).
export function AssistantPendingRow({ children }) {
  return (
    <motion.div {...rowMotion} className="flex items-start gap-3">
      <AssistantAvatar />
      <div className="flex-1 min-w-0 flex flex-col items-start pt-1">{children}</div>
    </motion.div>
  );
}

export function TypingDots() {
  return (
    <div className="flex items-center gap-1 h-6" aria-label="Assistant is typing">
      {[0, 0.15, 0.3].map((delay) => (
        <motion.span
          key={delay}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay }}
          className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"
        />
      ))}
    </div>
  );
}
