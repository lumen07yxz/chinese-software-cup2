/**
 * VoiceModePanel v2 — 基于 Web Speech API + 现有 Spark LLM
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import DigitalHumanAvatar from './DigitalHumanAvatar';
import CodeBlock from './CodeBlock';
import {
  digitalHumanService,
  type DHState,
  type DHEvent,
} from '../services/digitalHumanService';
import { useChatStore } from '../stores/chatStore';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceModePanel() {
  const conversationId = useChatStore((s) => s.conversationId);

  const [dhState, setDhState] = useState<DHState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [userText, setUserText] = useState('');
  const [aiText, setAiText] = useState('');
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: 'user' | 'assistant'; text: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(Date.now());
  const dhStateRef = useRef(dhState);
  dhStateRef.current = dhState;
  const convIdRef = useRef(conversationId);
  convIdRef.current = conversationId;

  // 事件监听
  useEffect(() => {
    const unsub = digitalHumanService.addListener((event: DHEvent) => {
      switch (event.type) {
        case 'state_change':
          setDhState(event.state);
          break;
        case 'user_text':
          setUserText(event.text);
          if (event.isFinal && event.text.startsWith('语音识别中')) break;
          if (event.text && !event.isFinal && !conversationHistory.length) {
            // do nothing, interim result
            break;
          }
          if (event.text && !event.isFinal && dhStateRef.current === 'listening') {
            setConversationHistory((prev) => {
              if (prev.length > 0 && prev[prev.length - 1].role === 'user' && !prev[prev.length - 1].text) {
                const next = [...prev];
                next[next.length - 1] = { role: 'user', text: event.text };
                return next;
              }
              if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
                return prev;
              }
              return [...prev, { role: 'user', text: event.text || '...' }];
            });
          }
          break;
        case 'ai_text':
          if (event.isFinal) {
            setAiText('');
            setConversationHistory((prev) => [
              ...prev,
              { role: 'assistant', text: event.text },
            ]);
          } else {
            setAiText(event.text);
          }
          break;
        case 'audio_level':
          setAudioLevel(event.level);
          break;
        case 'error':
          setError(event.message);
          break;
      }
    });
    return unsub;
  }, []);

  // 时长
  useEffect(() => {
    startTimeRef.current = Date.now();
    const timer = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 滚动
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [conversationHistory, userText, aiText]);

  // 按住/松开麦克风
  const handleMicDown = useCallback(() => {
    setError(null);
    digitalHumanService.startListening(convIdRef.current);
  }, []);

  const handleMicUp = useCallback(() => {
    digitalHumanService.stopAndTranscribe();
  }, []);

  // 结束
  const handleEndSession = useCallback(() => {
    digitalHumanService.stopAll();
    setDhState('idle');
  }, []);

  const stateLabel: Record<string, string> = {
    idle: '准备就绪',
    listening: '聆听中...',
    thinking: '思考中...',
    speaking: '回答中...',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-surface/50 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            dhState === 'idle' ? 'bg-green-500' :
            dhState === 'listening' ? 'bg-green-500' :
            dhState === 'thinking' ? 'bg-yellow-500' : 'bg-amber'
          } ${dhState !== 'idle' ? 'animate-pulse' : ''}`} />
          <h1 className="text-lg font-semibold text-ink">数字人对话</h1>
        </div>
        <span className="text-[13px] text-muted ml-2">{stateLabel[dhState]}</span>
        <span className="text-[12px] text-muted ml-auto font-mono">
          {formatDuration(duration)}
        </span>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-600 flex items-center gap-2 animate-[fadeIn_0.3s_ease-out]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* 主内容 */}
      <div className="flex-1 flex flex-col items-center justify-start overflow-hidden px-4 py-6">
        {/* 头像 */}
        <div className="flex-shrink-0 mb-6">
          <DigitalHumanAvatar state={dhState} audioLevel={audioLevel} size={220} />
        </div>

        {/* 转写 */}
        <div ref={transcriptRef} className="w-full max-w-2xl flex-1 overflow-y-auto space-y-3 px-2 min-h-0">
          {conversationHistory.map((item, i) => (
            <div key={i} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-4 py-2.5 rounded-lg text-[14px] leading-relaxed ${
                item.role === 'user'
                  ? 'bg-ink text-warm-white'
                  : 'bg-surface border border-border text-ink'
              }`}>
                {item.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none prose-headings:text-ink prose-a:text-amber">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ code: CodeBlock }}>
                      {item.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap m-0">{item.text}</p>
                )}
              </div>
            </div>
          ))}

          {/* 实时用户文本 */}
          {userText && conversationHistory[conversationHistory.length - 1]?.role !== 'user' && (
            <div className="flex justify-end animate-[fadeIn_0.2s_ease-out]">
              <div className="max-w-[85%] px-4 py-2.5 rounded-lg text-[14px] bg-ink/80 text-warm-white italic">
                {userText}
              </div>
            </div>
          )}

          {/* 实时 AI 文本 */}
          {aiText && (
            <div className="flex justify-start animate-[fadeIn_0.2s_ease-out]">
              <div className="max-w-[85%] px-4 py-2.5 rounded-lg text-[14px] bg-surface border border-border text-ink">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ code: CodeBlock }}>
                    {aiText}
                  </ReactMarkdown>
                  <span className="inline-block w-1.5 h-3.5 bg-amber rounded-full ml-0.5 align-middle"
                    style={{ animation: 'cursorBlink 0.8s ease-in-out infinite' }} />
                </div>
              </div>
            </div>
          )}

          {conversationHistory.length === 0 && !userText && !aiText && (
            <div className="text-center py-8">
              <p className="text-sm text-muted">点击麦克风按钮开始语音对话</p>
              <p className="text-[12px] text-muted/60 mt-2">支持中文语音输入，AI 自动识别并回复</p>
            </div>
          )}
        </div>
      </div>

      {/* 控制栏 */}
      <div className="flex-shrink-0 px-4 md:px-6 py-5 border-t border-border bg-surface/50">
        <div className="max-w-2xl mx-auto flex items-center justify-center gap-6">
          {/* 音量条 */}
          <div className="flex-1 flex items-center gap-1 justify-end">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}
                className={`w-1 rounded-full transition-all duration-75 ${
                  audioLevel > (i + 1) / 12 && dhState === 'speaking' ? 'bg-amber' : 'bg-border'
                }`}
                style={{ height: `${8 + i * 1.5}px` }}
              />
            ))}
          </div>

          {/* 麦克风按钮（按住说话） */}
          <button
            onMouseDown={handleMicDown}
            onMouseUp={handleMicUp}
            onTouchStart={handleMicDown}
            onTouchEnd={handleMicUp}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-100 select-none ${
              dhState === 'listening'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 scale-95'
                : dhState === 'thinking'
                ? 'bg-yellow-500 text-white cursor-wait'
                : 'bg-ink hover:bg-ink-light text-warm-white shadow-lg active:scale-95'
            }`}
          >
            {dhState === 'listening' && (
              <>
                <span className="absolute inset-0 rounded-full bg-red-500/30 animate-[dhPulse_1.5s_ease-out_infinite]" />
                <span className="absolute inset-0 rounded-full bg-red-500/20 animate-[dhPulse_1.5s_ease-out_0.5s_infinite]" />
              </>
            )}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          {/* 留白 */}
          <div className="flex-1" />
        </div>

        <div className="text-center mt-3">
          <span className="text-[13px] text-muted font-medium">
            {dhState === 'listening' && '🎙️ 按住说话，松开识别'}
            {dhState === 'thinking' && '⏳ 识别中...'}
            {dhState === 'speaking' && '🔊 回复中'}
            {dhState === 'idle' && '按住说话'}
          </span>
        </div>
      </div>
    </div>
  );
}
