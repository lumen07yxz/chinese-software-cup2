import { useCallback, useRef, useEffect } from 'react';
import ChatBubble from '../../components/ChatBubble';
import ChatInput from '../../components/ChatInput';
import ProfilePanel from '../../components/ProfilePanel';
import { useChatStore } from '../../stores/chatStore';
import { useProfileStore } from '../../stores/profileStore';
import { sendChatMessage, type ChatMessage } from '../../services/api';

export default function ChatPage() {
  const { messages, isStreaming, addMessage, appendToLast, setStreaming } = useChatStore();
  const { profile, setProfile } = useProfileStore();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (text: string) => {
    if (isStreaming) return;

    addMessage({ role: 'user', content: text });

    const history: ChatMessage[] = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    setStreaming(true);

    // Add empty assistant message
    addMessage({ role: 'assistant', content: '' });

    await sendChatMessage(
      text,
      'default',
      history,
      // onChunk
      (chunk) => appendToLast(chunk),
      // onDone
      () => setStreaming(false),
      // onError
      (err) => {
        appendToLast(`\n\n> 出错了: ${err}`);
        setStreaming(false);
      },
      // onEvent — 处理事件（profile_update）
      (type, data) => {
        if (type === 'profile_update') {
          const profileData = (data as Record<string, unknown>).data as Record<string, unknown>;
          if (profileData && (profileData.knowledge_base || profileData.cognitive_style)) {
            setProfile(profileData as Parameters<typeof setProfile>[0]);
          }
        }
      },
      // existingProfile — 传已有画像供后端更新参考
      profile,
    );

    // 不再需要客户端的正则解析 —— 已由后端 profile_update 事件替代
  }, [messages, isStreaming, addMessage, appendToLast, setStreaming, setProfile, profile]);

  return (
    <div className="flex h-screen max-h-screen">
      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-warm-white">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-surface/50">
          <h1 className="text-lg font-semibold text-ink">对话画像</h1>
          <p className="text-[13px] text-muted mt-0.5">
            与 AI 自然对话，系统自动识别你的学习背景、能力和偏好
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {messages.length === 0 && (
            <div className="text-center mt-20">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-cream flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2D4A3E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h2 className="text-lg font-medium text-ink mb-2">开始构建你的学习画像</h2>
              <p className="text-sm text-muted max-w-md mx-auto">
                告诉我你的专业、学过的课程、想达成的目标、每周有多少学习时间，我会帮你打造专属学习方案。
              </p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                {['我是计算机专业大二学生', '我想系统学习深度学习', '我对NLP很感兴趣', '我是零基础初学者'].map((hint) => (
                  <button
                    key={hint}
                    onClick={() => handleSend(hint)}
                    disabled={isStreaming}
                    className="px-3.5 py-1.5 text-[13px] text-ink bg-surface border border-border rounded-full
                      hover:bg-cream transition-colors disabled:opacity-40"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              isStreaming={isStreaming && msg === messages[messages.length - 1] && msg.role === 'assistant'}
            />
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-border bg-surface/50">
          <div className="max-w-2xl">
            <ChatInput onSend={handleSend} disabled={isStreaming} />
          </div>
        </div>
      </div>

      {/* Side panel - Profile */}
      <div className="w-72 flex-shrink-0 border-l border-border bg-surface/30 p-4 overflow-y-auto">
        <ProfilePanel profile={profile} />
      </div>
    </div>
  );
}
