import { create } from 'zustand';
import type { StudentProfile } from '../services/api';

function profileKey(username?: string): string {
  return username ? `profile_${username}` : 'profile_unknown';
}

function historyKey(username: string): string {
  return `profile_history_${username}`;
}

export interface ProfileSnapshot {
  date: string;
  knowledge_base: Record<string, number>;
}

/** 记录一次知识掌握度快照（最多保留 30 条，按日期去重） */
export function recordSnapshot(username: string, kb: Record<string, number>) {
  if (!kb || Object.keys(kb).length === 0) return;
  try {
    const key = historyKey(username);
    const existing: ProfileSnapshot[] = JSON.parse(localStorage.getItem(key) || '[]');
    const today = new Date().toISOString().slice(0, 10);
    // 去重：同一天只保留最新
    const filtered = existing.filter(s => s.date !== today);
    filtered.push({ date: today, knowledge_base: { ...kb } });
    // 最多保留 30 条
    const trimmed = filtered.slice(-30);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

/** 读取历史快照 */
export function loadSnapshots(username: string): ProfileSnapshot[] {
  try {
    return JSON.parse(localStorage.getItem(historyKey(username)) || '[]');
  } catch { return []; }
}

interface ProfileState {
  profile: StudentProfile | null;
  setProfile: (p: StudentProfile, username?: string) => void;
  updateProfile: (partial: Partial<StudentProfile>, username?: string) => void;
  clearProfile: () => void;
  loadFromCache: (username: string) => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,

  setProfile: (p, username) => {
    if (username) {
      localStorage.setItem(profileKey(username), JSON.stringify(p));
      recordSnapshot(username, p.knowledge_base || {});
    }
    set({ profile: p });
  },

  updateProfile: (partial, username) => {
    const current = get().profile;
    if (current) {
      const updated = { ...current, ...partial };
      if (username) {
        localStorage.setItem(profileKey(username), JSON.stringify(updated));
        recordSnapshot(username, updated.knowledge_base || {});
      }
      set({ profile: updated });
    }
  },

  clearProfile: () => set({ profile: null }),

  loadFromCache: (username) => {
    try {
      const cached = localStorage.getItem(profileKey(username));
      if (cached) {
        const parsed = JSON.parse(cached);
        set({ profile: parsed });
      }
    } catch { /* ignore corrupt cache */ }
  },
}));
