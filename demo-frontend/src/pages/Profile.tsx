import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Card, Avatar } from '../components/ui';
import { LogOut, ChevronRight, MessageCircle, Languages, BookOpen, Award, Camera, Settings } from 'lucide-react';

const CEFR_MAP: Record<string, { label: string; color: string }> = {
  A1: { label: '入门', color: 'text-sage-400' },
  A2: { label: '基础', color: 'text-sage-400' },
  B1: { label: '中级', color: 'text-blue-400' },
  B2: { label: '中高级', color: 'text-purple-400' },
  C1: { label: '高级', color: 'text-amber-400' },
  C2: { label: '精通', color: 'text-red-400' },
};

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const cefr = CEFR_MAP[user?.cefr_level || ''];

  const menuItems = [
    { icon: Award, label: 'CEFR 评测', desc: '测试你的英语水平', path: '/assessment', bg: 'bg-brand-500/10', iconColor: 'text-brand-400' },
    { icon: MessageCircle, label: 'AI 对话记录', desc: '查看历史对话', path: '/chat', bg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
    { icon: Languages, label: '翻译历史', desc: '查看翻译记录', path: '/translate', bg: 'bg-sky-500/10', iconColor: 'text-sky-400' },
    { icon: Camera, label: '场景录', desc: '拍照识别单词', path: '/snap', bg: 'bg-violet-500/10', iconColor: 'text-violet-400' },
    { icon: BookOpen, label: '生词本', desc: '管理学习单词', path: '/words', bg: 'bg-brand-500/10', iconColor: 'text-brand-400' },
  ];

  return (
    <div className="page animate-fade-in space-y-5">
      {/* ── Profile Card ── */}
      <Card variant="glow" padding="lg">
        <div className="flex items-center gap-4">
          <Avatar
            name={user?.nickname || 'L'}
            size="xl"
            className="ring-brand-500/20"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-ink-100 font-[family-name:var(--font-display)]">
              {user?.nickname || '同学'}
            </h2>
            <p className="text-xs text-ink-500 truncate mt-0.5">{user?.email}</p>
            {cefr && (
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs font-semibold font-[family-name:var(--font-display)] ${cefr.color}`}>
                  {user?.cefr_level}
                </span>
                <span className="text-xs text-ink-500">·</span>
                <span className="text-xs text-ink-400">{cefr.label}水平</span>
              </div>
            )}
          </div>
          <ChevronRight size={18} className="text-ink-500" />
        </div>
      </Card>

      {/* ── Menu ── */}
      <div className="space-y-1.5">
        {/* Settings — always first */}
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-ink-800/60 border border-brand-500/10
                     hover:border-brand-500/25 hover:bg-ink-800/80 transition-all duration-200 text-left active:scale-[0.99]"
        >
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
            <Settings size={18} className="text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-200 font-[family-name:var(--font-display)]">设置</p>
            <p className="text-xs text-ink-500 mt-0.5">界面风格与偏好</p>
          </div>
          <ChevronRight size={16} className="text-ink-600" />
        </button>

        {menuItems.map(({ icon: Icon, label, desc, path, bg, iconColor }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-ink-800/60 border border-ink-700/40
                       hover:border-brand-500/15 hover:bg-ink-800/80 transition-all duration-200 text-left active:scale-[0.99]"
          >
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={18} className={iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-200 font-[family-name:var(--font-display)]">{label}</p>
              <p className="text-xs text-ink-500 mt-0.5">{desc}</p>
            </div>
            <ChevronRight size={16} className="text-ink-600" />
          </button>
        ))}
      </div>

      {/* ── Logout ── */}
      <button
        onClick={() => { logout(); navigate('/login'); }}
        className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-red-500/5 border border-red-500/10
                   hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-200 text-left active:scale-[0.99]"
      >
        <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
          <LogOut size={18} className="text-red-400" />
        </div>
        <span className="text-sm font-medium text-red-400 font-[family-name:var(--font-display)]">退出登录</span>
      </button>

      <p className="text-center text-xs text-ink-600 pt-2 font-[family-name:var(--font-display)]">
        LinguaLearn v1.0 · AI 驱动的英语学习
      </p>
    </div>
  );
}
