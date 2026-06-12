import { useCallback, useRef, useEffect, useState } from 'react';
import ChatBubble from '../../components/ChatBubble';
import ChatInput from '../../components/ChatInput';
import ProfilePanel from '../../components/ProfilePanel';
import { useChatStore } from '../../stores/chatStore';
import { useProfileStore } from '../../stores/profileStore';
import {
  sendChatMessage,
  fetchConversations,
  fetchConversationMessages,
  createConversation,
  deleteConversation,
  type ConversationItem,
} from '../../services/api';

export default function ChatPage() {
  const {
    messages, isStreaming, conversationId,
    addMessage, appendToLast, setStreaming, setConversationId, loadMessages, clearMessages,
  } = useChatStore();
  const { profile, setProfile } = useProfileStore();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);

  // 加载对话列表
  const loadConvList = useCallback(async () => {
    try {
      const data = await fetchConversations();
      setConversations(data.conversations || []);
    } catch { setConversations([]); }
  }, []);

  useEffect(() => {
    loadConvList();
  }, []);

  // Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 选择历史对话
  const handleSelectConversation = useCallback(async (id: number) => {
    setStreaming(true);
    try {
      const data = await fetchConversationMessages(id);
      loadMessages(data.messages || []);
      setConversationId(id);
    } catch { /* ignore */ }
    setStreaming(false);
  }, [loadMessages, setConversationId, setStreaming]);

  // 新建对话
  const handleNewConversation = useCallback(() => {
    clearMessages();
    setShowSidebar(false);
  }, [clearMessages]);

  // 删除对话
  const handleDeleteConversation = useCallback(async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      if (conversationId === id) clearMessages();
      loadConvList();
    } catch { /* ignore */ }
  }, [conversationId, clearMessages, loadConvList]);

  const handleSend = useCallback(async (text: string) => {
    if (isStreaming) return;

    addMessage({ role: 'user', content: text });
    setStreaming(true);
    addMessage({ role: 'assistant', content: '' });

    await sendChatMessage(
      text,
      conversationId,
      (chunk) => appendToLast(chunk),
      (newConvId) => {
        setConversationId(newConvId);
        setStreaming(false);
        loadConvList(); // 刷新对话列表
      },
      (err) => {
        appendToLast(`\n\n> 出错了: ${err}`);
        setStreaming(false);
      },
      (type, data) => {
        if (type === 'profile_update') {
          const profileData = (data as Record<string, unknown>).data as Record<string, unknown>;
          if (profileData && (profileData.knowledge_base || profileData.cognitive_style)) {
            setProfile(profileData as Parameters<typeof setProfile>[0]);
          }
        }
      },
    );
  }, [conversationId, isStreaming, addMessage, appendToLast, setStreaming,
      setConversationId, setProfile, loadConvList]);

  return (
    <div className="flex h-screen max-h-screen">
      {/* Conversation sidebar */}
      <div className={`border-r border-border bg-surface/50 flex-shrink-0
        transition-[width] duration-200 ${showSidebar ? 'w-56' : 'w-0 overflow-hidden'}`}>
        <div className="w-56 p-3 space-y-1">
          <button
            onClick={handleNewConversation}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink
              bg-cream rounded-lg hover:bg-ink hover:text-warm-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            新对话
          </button>
          <div className="space-y-0.5 max-h-[calc(100vh-10rem)] overflow-y-auto">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className={`group flex items-center gap-1 px-3 py-2 text-[13px] rounded-lg cursor-pointer
                  transition-colors
                  ${conv.id === conversationId
                    ? 'bg-ink text-warm-white'
                    : 'text-muted hover:bg-cream hover:text-ink'
                  }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span className="truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity flex-shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-warm-white">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-surface/50 flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1 text-muted hover:text-ink transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-ink">对话画像</h1>
            <p className="text-[13px] text-muted mt-0.5">
              与 AI 自然对话，系统自动识别你的学习背景、能力和偏好
            </p>
          </div>
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
      <div className="w-72 flex-shrink-0 border-l border-border bg-surface/30 p-4 overflow-y-auto hidden lg:block">
        <ProfilePanel profile={profile} />
      </div>
    </div>
  );
}
