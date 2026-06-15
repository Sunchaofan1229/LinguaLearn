import { useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, Radio, BookOpen, Camera, User, type LucideIcon } from 'lucide-react';

const tabs: { path: string; label: string; Icon: LucideIcon }[] = [
  { path: '/', label: '首页', Icon: Home },
  { path: '/chat', label: '陪练', Icon: MessageCircle },
  { path: '/simul', label: '同传', Icon: Radio },
  { path: '/words', label: '单词', Icon: BookOpen },
  { path: '/snap', label: '场景录', Icon: Camera },
  { path: '/profile', label: '我的', Icon: User },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      {/* Background with subtle gradient fade */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/98 to-ink-950/85 backdrop-blur-xl border-t border-ink-800/60" />

      <div className="relative flex items-center justify-around h-[4.25rem] max-w-lg mx-auto px-2">
        {tabs.map(({ path, label, Icon }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 group"
            >
              {/* Active indicator pill */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-brand-500" />
              )}

              {/* Icon container */}
              <span className={`relative transition-all duration-300 ease-out-expo ${
                active
                  ? 'text-brand-400 scale-110'
                  : 'text-ink-500 group-hover:text-ink-300'
              }`}>
                <Icon size={active ? 22 : 20} strokeWidth={active ? 2.5 : 1.8} />
              </span>

              {/* Label */}
              <span className={`text-[10px] font-medium leading-tight transition-all duration-300 font-[family-name:var(--font-display)] ${
                active
                  ? 'text-brand-400 font-semibold'
                  : 'text-ink-500 group-hover:text-ink-400'
              }`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
