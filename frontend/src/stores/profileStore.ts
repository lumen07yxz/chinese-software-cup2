import { create } from 'zustand';
import type { StudentProfile } from '../services/api';

function profileKey(username?: string): string {
  return username ? `profile_${username}` : 'profile_unknown';
}

interface ProfileState {
  profile: StudentProfile | null;
  setProfile: (p: StudentProfile, username?: string) => void;
  updateProfile: (partial: Partial<StudentProfile>, username?: string) => void;
  clearProfile: () => void;
  loadFromCache: (username: string) => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,  // 不再从 localStorage 初始化，由 loadFromCache 按账号加载

  setProfile: (p, username) => {
    if (username) {
      localStorage.setItem(profileKey(username), JSON.stringify(p));
    }
    set({ profile: p });
  },

  updateProfile: (partial, username) => {
    const current = get().profile;
    if (current) {
      const updated = { ...current, ...partial };
      if (username) {
        localStorage.setItem(profileKey(username), JSON.stringify(updated));
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
