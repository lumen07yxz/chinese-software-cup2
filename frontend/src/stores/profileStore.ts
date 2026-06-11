import { create } from 'zustand';
import type { StudentProfile } from '../services/api';

interface ProfileState {
  profile: StudentProfile | null;
  setProfile: (p: StudentProfile) => void;
  updateProfile: (partial: Partial<StudentProfile>) => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,

  setProfile: (p) => set({ profile: p }),

  updateProfile: (partial) => {
    const current = get().profile;
    if (current) {
      set({ profile: { ...current, ...partial } });
    }
  },
}));
