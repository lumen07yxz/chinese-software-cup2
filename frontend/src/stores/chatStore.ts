import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  conversationId: number | null;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  appendToLast: (chunk: string) => void;
  setStreaming: (v: boolean) => void;
  setConversationId: (id: number | null) => void;
  loadMessages: (msgs: { role: string; content: string }[]) => void;
  clearMessages: () => void;
}

let msgId = 0;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  conversationId: null,

  addMessage: (msg) => {
    const newMsg: Message = {
      ...msg,
      id: `msg-${++msgId}`,
      timestamp: Date.now(),
    };
    set({ messages: [...get().messages, newMsg] });
  },

  appendToLast: (chunk) => {
    const msgs = [...get().messages];
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      msgs[msgs.length - 1] = {
        ...msgs[msgs.length - 1],
        content: msgs[msgs.length - 1].content + chunk,
      };
      set({ messages: msgs });
    }
  },

  setStreaming: (v) => set({ isStreaming: v }),

  setConversationId: (id) => set({ conversationId: id }),

  loadMessages: (msgs) => {
    const mapped = msgs.map((m, i) => ({
      id: `msg-${++msgId}`,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: Date.now() - (msgs.length - i) * 1000,
    }));
    set({ messages: mapped });
  },

  clearMessages: () => set({ messages: [], conversationId: null }),
}));
