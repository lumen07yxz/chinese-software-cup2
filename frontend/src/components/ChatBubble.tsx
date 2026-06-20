import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useRef, useEffect } from 'react';
import CodeBlock from './CodeBlock';
import type { Message } from '../stores/chatStore';

interface Props {
  message: Message;
  isStreaming?: boolean;
}

export default function ChatBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [message.content]);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} mb-5`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium
          ${isUser
            ? 'bg-amber text-warm-white'
            : 'bg-ink text-warm-white'
          }`}
      >
        {isUser ? '我' : 'AI'}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] min-w-0 px-4 py-3 rounded-lg text-[15px] leading-relaxed
          ${isUser
            ? 'bg-ink text-warm-white'
            : 'bg-surface border border-border text-gray-800'
          }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap m-0">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-headings:text-ink prose-a:text-amber prose-code:text-sm prose-pre:bg-[#f8f7f5] prose-pre:border prose-pre:border-border">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code: CodeBlock,
                img: ({ src, alt }: { src?: string; alt?: string }) => {
                  if (!src || (!src.startsWith('/') && !src.startsWith('data:'))) {
                    return null
                  }
                  return <img src={src} alt={alt} className="max-w-full rounded" />
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-amber animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
