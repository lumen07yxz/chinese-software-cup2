import { create } from 'zustand';

export interface AuthUser {
  username: string;
  nickname: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

/** 同步读取 localStorage，避免首屏渲染时 isAuthenticated=false 导致闪跳登录页 */
function readInitialAuth(): { token: string | null; user: AuthUser | null } {
  try {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    if (token && userStr) {
      return { token, user: JSON.parse(userStr) };
    }
  } catch { /* corrupted storage, ignore */ }
  return { token: null, user: null };
}

const initial = readInitialAuth();

export const useAuthStore = create<AuthState>((set) => ({
  user: initial.user,
  token: initial.token,
  isAuthenticated: !!initial.token,

  login: (token, user) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    // 清除所有账号相关的 localStorage 缓存
    const keysToRemove = ['auth_token', 'auth_user', 'user_profile'];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('profile_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    set({ token: null, user: null, isAuthenticated: false });
  },

  loadFromStorage: () => {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ token, user, isAuthenticated: true });
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    }
  },
}));
