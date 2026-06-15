import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Theme = 'dark' | 'light' | 'ocean' | 'sakura' | 'forest' | 'violet';

export const THEME_META: Record<Theme, { label: string; icon: string; desc: string; palette: string[] }> = {
  dark:   { label: '精编暗色', icon: '🌙', desc: '墨水暖金 · 精读学习', palette: ['#0e1016', '#f59e0b', '#4ade80'] },
  light:  { label: '禅意自然', icon: '☀️', desc: '温纸青玉 · 柔和护眼', palette: ['#f5f2eb', '#1a6566', '#d4a574'] },
  ocean:  { label: '深海钴蓝', icon: '🌊', desc: '冷静专注 · 思考深邃', palette: ['#070e1f', '#0d9de0', '#14b8a6'] },
  sakura: { label: '樱花柔粉', icon: '🌸', desc: '温暖柔和 · 学习甜心', palette: ['#14080e', '#f43f5e', '#f97316'] },
  forest: { label: '森林晨光', icon: '🌿', desc: '自然清新 · 生机勃勃', palette: ['#0a1008', '#f59e0b', '#22c55e'] },
  violet: { label: '午夜紫调', icon: '✨', desc: '创意优雅 · 灵感之泉', palette: ['#0b0818', '#a855f7', '#8b5cf6'] },
};

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
});

const STORAGE_KEY = 'll_theme_v2';

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && Object.keys(THEME_META).includes(stored)) return stored as Theme;
    // migrate from old key
    const old = localStorage.getItem('ll_theme');
    if (old === 'light') return 'light';
    if (old === 'dark') return 'dark';
  } catch {}
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(STORAGE_KEY, t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors: Record<Theme, string> = {
        dark: '#0e1016', light: '#f5f2eb', ocean: '#070e1f',
        sakura: '#14080e', forest: '#0a1008', violet: '#0b0818',
      };
      meta.setAttribute('content', colors[t]);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
