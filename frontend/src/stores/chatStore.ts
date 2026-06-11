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
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  appendToLast: (chunk: string) => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
}

let msgId = 0;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,

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
  clearMessages: () => set({ messages: [] }),
}));
