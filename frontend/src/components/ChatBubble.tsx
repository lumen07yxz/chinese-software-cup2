import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useRef, useEffect } from 'react';
import CodeBlock from './CodeBlock';
import ThinkingIndicator from './ThinkingIndicator';
import AIIcon from './AIIcon';
import type { Message } from '../stores/chatStore';

interface Props {
  message: Message;
  isStreaming?: boolean;
}

export default function ChatBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';
  const contentRef = useRef<HTMLDivElement>(null);
  const isEmpty = !message.content;

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [message.content]);

  // 流式输出为空时显示思考中动画
  if (!isUser && isStreaming && isEmpty) {
    return (
      <div className="flex gap-3 mb-5">
        <ThinkingIndicator />
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} mb-5`}>
      {/* Avatar */}
      {isUser ? (
        <div className="w-9 h-9 rounded-full bg-cream flex items-center justify-center flex-shrink-0 text-sm font-medium text-ink">
          我
        </div>
      ) : (
        <AIIcon size={36} />
      )}

      {/* Bubble */}
      <div
        className={`max-w-[80%] min-w-0 px-4 py-3 rounded-lg text-[15px] leading-relaxed
          ${isUser
            ? 'bg-ink text-warm-white'
            : 'bg-surface border border-border text-ink'
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
              <span className="inline-block w-[3px] h-4 bg-amber rounded-full ml-0.5 align-middle"
                style={{ animation: 'cursorBlink 0.8s ease-in-out infinite' }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
