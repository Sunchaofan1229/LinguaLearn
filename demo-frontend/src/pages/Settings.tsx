import { useNavigate } from 'react-router-dom';
import { useTheme, THEME_META, type Theme } from '../hooks/useTheme';
import { Card } from '../components/ui';
import { ArrowLeft, Palette, Check, Sparkles } from 'lucide-react';

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const handleThemeChange = (t: Theme) => {
    setTheme(t);
  };

  return (
    <div className="page animate-fade-in space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-ink-800/60 border border-ink-700/40 flex items-center justify-center
                     hover:bg-ink-700/60 hover:border-brand-500/20 transition-all active:scale-95"
        >
          <ArrowLeft size={18} className="text-ink-300" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-ink-100 font-[family-name:var(--font-display)]">设置</h1>
          <p className="text-xs text-ink-400 mt-0.5">个性化你的学习体验</p>
        </div>
      </div>

      {/* ── Theme Section ── */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <Palette size={15} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-ink-200 font-[family-name:var(--font-display)]">
            界面风格
          </h2>
          <span className="text-[10px] text-ink-500 ml-auto">{Object.keys(THEME_META).length} 套方案可选</span>
        </div>

        <div className="grid grid-cols-2 gap-3 stagger">
          {(Object.entries(THEME_META) as [Theme, typeof THEME_META['dark']][]).map(([key, meta]) => {
            const active = theme === key;
            return (
              <button
                key={key}
                onClick={() => handleThemeChange(key)}
                className={`group relative flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 transition-all duration-300 text-left
                  ${active
                    ? 'border-brand-500/40 bg-brand-500/5 shadow-lg shadow-brand-500/5'
                    : 'border-ink-700/40 bg-ink-800/40 hover:border-ink-600 hover:bg-ink-800/60'
                  }
                  active:scale-[0.97]`}
              >
                {/* Active checkmark */}
                {active && (
                  <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
                    <Check size={11} className="text-white" strokeWidth={3} />
                  </span>
                )}

                {/* Color preview strip */}
                <div className="flex gap-0.5 w-full h-2.5 rounded-full overflow-hidden">
                  {meta.palette.map((color, i) => (
                    <div
                      key={i}
                      className="flex-1 h-full transition-all duration-300"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                {/* Simulated mini preview */}
                <div
                  className="w-full aspect-[2/1] rounded-xl border overflow-hidden transition-all duration-300 relative"
                  style={{
                    backgroundColor: meta.palette[0],
                    borderColor: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  {/* Nav bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-[30%] rounded-t-lg flex items-end justify-around pb-1.5 px-2"
                       style={{ background: `linear-gradient(to top, ${meta.palette[0]}, transparent)` }}>
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: meta.palette[1], opacity: 0.8 }} />
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: meta.palette[1], opacity: 0.3 }} />
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: meta.palette[1], opacity: 0.3 }} />
                  </div>
                  {/* Accent bar */}
                  <div className="absolute top-0 left-0 right-0 h-[12%] rounded-t-lg"
                       style={{ background: `linear-gradient(135deg, ${meta.palette[1]}40, transparent)` }} />
                  {/* Content dots */}
                  <div className="absolute top-[30%] left-[15%] right-[15%] space-y-1">
                    <div className="w-full h-1 rounded-full" style={{ backgroundColor: meta.palette[2], opacity: 0.4 }} />
                    <div className="w-3/4 h-1 rounded-full" style={{ backgroundColor: meta.palette[2], opacity: 0.25 }} />
                    <div className="w-1/2 h-1 rounded-full" style={{ backgroundColor: meta.palette[2], opacity: 0.15 }} />
                  </div>
                </div>

                {/* Label + desc */}
                <div className="text-center w-full">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-sm">{meta.icon}</span>
                    <span className={`text-xs font-semibold font-[family-name:var(--font-display)] transition-colors ${
                      active ? 'text-brand-400' : 'text-ink-300 group-hover:text-ink-200'
                    }`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className={`text-[10px] mt-0.5 transition-colors ${
                    active ? 'text-brand-400/60' : 'text-ink-500'
                  }`}>
                    {meta.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── About ── */}
      <Card padding="lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Sparkles size={20} className="text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-200 font-[family-name:var(--font-display)]">LinguaLearn</p>
            <p className="text-xs text-ink-500">v1.0.0 · AI 驱动的英语学习</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
