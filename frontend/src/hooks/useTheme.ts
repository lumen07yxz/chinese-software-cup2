import { useState, useCallback, useEffect } from 'react';

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { return 'light'; }
}

/** H45: 暗黑模式切换 hook */
export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(getInitialTheme);

  useEffect(() => {
    // 同步 class 到 <html>
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
