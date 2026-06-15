import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import { Card, Badge, EmptyState, Skeleton, ProgressBar } from '../components/ui';
import {
  Trophy, MessageCircle, Radio, Camera, Languages, BookOpen,
  Sparkles, TrendingUp, Clock, ArrowRight, ChevronRight,
  Flame, BookOpenCheck, GraduationCap, Target
} from 'lucide-react';

interface Result {
  id: string; cefr_level: string; score: number; total: number; created_at: string;
}

interface WordStats {
  total: number;
  mastered: number;
  learning: number;
  new_count: number;
  by_level: Record<string, number>;
  by_status: Record<string, number>;
  by_cefr: Record<string, number>;
  by_source: Record<string, number>;
  streak_days: number;
}

const CEFR_MAP: Record<string, { label: string; color: 'sage' | 'brand' | 'blue' | 'purple' | 'red' | 'amber' }> = {
  A1: { label: '入门', color: 'sage' },
  A2: { label: '基础', color: 'sage' },
  B1: { label: '中级', color: 'blue' },
  B2: { label: '中高级', color: 'purple' },
  C1: { label: '高级', color: 'amber' },
  C2: { label: '精通', color: 'red' },
};

const QUICK_ACTIONS = [
  { label: 'AI 对话', desc: '口语陪练', icon: MessageCircle, path: '/chat', gradient: 'from-emerald-500/15 to-emerald-600/5', iconColor: 'text-emerald-400' },
  { label: '同声传译', desc: '实时翻译', icon: Radio, path: '/simul', gradient: 'from-rose-500/15 to-rose-600/5', iconColor: 'text-rose-400' },
  { label: '场景录', desc: '拍照识别', icon: Camera, path: '/snap', gradient: 'from-sky-500/15 to-sky-600/5', iconColor: 'text-sky-400' },
  { label: '单词摘录', desc: '导入材料', icon: Languages, path: '/import', gradient: 'from-violet-500/15 to-violet-600/5', iconColor: 'text-violet-400' },
  { label: '生词本', desc: '复习巩固', icon: BookOpen, path: '/words', gradient: 'from-brand-500/15 to-brand-600/5', iconColor: 'text-brand-400' },
];

export default function Dashboard() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<Result[]>([]);
  const [wordStats, setWordStats] = useState<WordStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState('');
  const hasRedirected = useRef(false);

  // Fetch assessment results
  const fetchData = () => {
    if (!token) return;
    setLoading(true);
    api.getResults(token)
      .then(setResults)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  // Fetch word statistics
  const fetchStats = () => {
    if (!token) return;
    setStatsLoading(true);
    api.getWordStats(token)
      .then(setWordStats)
      .catch(() => {}) // silently fail — stats are not critical
      .finally(() => setStatsLoading(false));
  };

  useEffect(fetchData, [token]);
  useEffect(fetchStats, [token]);

  useEffect(() => {
    if (hasRedirected.current) return;
    const onboardingDone = localStorage.getItem('lingualearn_onboarding_done');
    if (!onboardingDone && token) {
      hasRedirected.current = true;
      navigate('/onboarding', { replace: true });
    }
  }, [token, navigate]);

  const cefr = CEFR_MAP[user?.cefr_level || ''] || { label: '未评测', color: 'brand' };
  const userLevel = user?.cefr_level;
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 12) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  };

  const masteryPct = wordStats?.total ? Math.round((wordStats.mastered / wordStats.total) * 100) : 0;

  return (
    <div className="page animate-fade-in space-y-6">
      {/* ── Header ── */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink-400 font-[family-name:var(--font-display)] tracking-wider uppercase">
            {greeting()}
          </p>
          <h1 className="text-xl font-bold text-ink-100 mt-0.5 font-[family-name:var(--font-display)]">
            {user?.nickname || '同学'}
          </h1>
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="w-11 h-11 rounded-2xl bg-brand-500/10 border border-brand-500/15 flex items-center justify-center text-lg font-bold text-brand-400 font-[family-name:var(--font-display)] hover:bg-brand-500/20 transition-colors"
        >
          {(user?.nickname || 'L')[0].toUpperCase()}
        </button>
      </header>

      {/* ── CEFR Level Card ── */}
      <Card variant="glow" padding="lg" className="relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-brand-500/5 blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-400 font-[family-name:var(--font-display)] tracking-wide uppercase">
              当前水平
            </p>
            <div className="flex items-center gap-3">
              {userLevel ? (
                <span className="text-3xl font-bold text-brand-400 font-[family-name:var(--font-display)]">
                  {userLevel}
                </span>
              ) : null}
              <Badge color={cefr.color} dot>{cefr.label}</Badge>
            </div>
          </div>
          <button
            onClick={() => navigate('/assessment')}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-ink-950 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-95 font-[family-name:var(--font-display)]"
          >
            <Sparkles size={15} />
            {userLevel ? '重新评测' : '开始评测'}
          </button>
        </div>
      </Card>

      {/* ── Learning Stats ── */}
      <section>
        <h2 className="text-sm font-semibold text-ink-200 mb-3 font-[family-name:var(--font-display)] flex items-center gap-2">
          <GraduationCap size={16} className="text-brand-400" />
          学习统计
        </h2>

        {statsLoading ? (
          <div className="grid grid-cols-4 gap-2.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-ink-800/70 border border-ink-700/50 rounded-2xl px-3 py-3">
                <Skeleton width={24} height={24} rounded="lg" />
                <div className="mt-2.5 space-y-1.5">
                  <Skeleton width="70%" height={20} rounded="md" />
                  <Skeleton width="50%" height={10} rounded="md" />
                </div>
              </div>
            ))}
          </div>
        ) : wordStats ? (
          <div className="space-y-3">
            {/* Stat cards grid */}
            <div className="grid grid-cols-4 gap-2.5">
              <div className="bg-ink-800/70 border border-ink-700/50 rounded-2xl px-3 py-3">
                <Flame size={18} className="text-amber-400 mb-2" />
                <p className="text-xl font-bold text-ink-100 font-[family-name:var(--font-display)]">
                  {wordStats.streak_days}
                </p>
                <p className="text-[10px] text-ink-500 font-medium mt-0.5">连续打卡</p>
              </div>
              <div className="bg-ink-800/70 border border-ink-700/50 rounded-2xl px-3 py-3">
                <BookOpen size={18} className="text-blue-400 mb-2" />
                <p className="text-xl font-bold text-ink-100 font-[family-name:var(--font-display)]">
                  {wordStats.total}
                </p>
                <p className="text-[10px] text-ink-500 font-medium mt-0.5">总词汇量</p>
              </div>
              <div className="bg-ink-800/70 border border-ink-700/50 rounded-2xl px-3 py-3">
                <Target size={18} className="text-purple-400 mb-2" />
                <p className="text-xl font-bold text-ink-100 font-[family-name:var(--font-display)]">
                  {wordStats.learning}
                </p>
                <p className="text-[10px] text-ink-500 font-medium mt-0.5">学习中</p>
              </div>
              <div className="bg-ink-800/70 border border-ink-700/50 rounded-2xl px-3 py-3">
                <BookOpenCheck size={18} className="text-sage-400 mb-2" />
                <p className="text-xl font-bold text-ink-100 font-[family-name:var(--font-display)]">
                  {wordStats.mastered}
                </p>
                <p className="text-[10px] text-ink-500 font-medium mt-0.5">已掌握</p>
              </div>
            </div>

            {/* Mastery progress */}
            <Card padding="md" className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-300 font-[family-name:var(--font-display)]">
                  掌握进度
                </span>
                <span className="text-xs font-semibold text-sage-400 font-[family-name:var(--font-display)]">
                  {masteryPct}%
                </span>
              </div>
              <ProgressBar value={masteryPct} color="sage" size="md" />
            </Card>

            {/* Level distribution */}
            {wordStats.by_cefr && Object.keys(wordStats.by_cefr).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => {
                  const count = wordStats.by_cefr[level];
                  if (!count) return null;
                  return (
                    <Badge key={level} color={CEFR_MAP[level]?.color || 'blue'}>
                      {level} · {count} 词
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </section>

      {/* ── Quick Actions ── */}
      <section>
        <h2 className="text-sm font-semibold text-ink-200 mb-3 font-[family-name:var(--font-display)] flex items-center gap-2">
          <TrendingUp size={16} className="text-brand-400" />
          快捷功能
        </h2>
        <div className="grid grid-cols-5 gap-2.5">
          {QUICK_ACTIONS.map(({ label, desc, icon: Icon, path, gradient, iconColor }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-2 p-3 rounded-2xl bg-gradient-to-b ${gradient} border border-ink-700/40 hover:border-brand-500/20 transition-all duration-200 active:scale-95 group`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColor} bg-ink-900/40 group-hover:scale-110 transition-transform duration-200`}>
                <Icon size={20} strokeWidth={1.8} />
              </div>
              <span className="text-xs font-medium text-ink-200 font-[family-name:var(--font-display)]">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Recent Assessments ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink-200 font-[family-name:var(--font-display)] flex items-center gap-2">
            <Clock size={16} className="text-ink-400" />
            评测记录
          </h2>
          {results.length > 0 && (
            <span className="text-xs text-ink-500">{results.length} 次记录</span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="card py-3 flex items-center gap-3">
                <Skeleton width={36} height={36} rounded="xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton width="40%" height={14} rounded="md" />
                  <Skeleton width="25%" height={12} rounded="md" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <Card padding="lg">
            <div className="text-center py-4">
              <p className="text-sm text-red-400 mb-3">{error}</p>
              <button onClick={fetchData} className="text-sm text-brand-400 hover:text-brand-300 transition-colors font-[family-name:var(--font-display)]">
                重新加载
              </button>
            </div>
          </Card>
        ) : results.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="暂无评测记录"
            description="完成一次 CEFR 水平评测，获取专属学习建议"
            action={
              <button
                onClick={() => navigate('/assessment')}
                className="flex items-center gap-2 btn-primary btn-md"
              >
                立即评测 <ArrowRight size={14} />
              </button>
            }
          />
        ) : (
          <div className="stagger space-y-2">
            {results.slice(0, 5).map(r => (
              <Card
                key={r.id}
                variant="interactive"
                className="flex items-center justify-between py-3"
                onClick={() => navigate('/assessment')}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/15 flex items-center justify-center">
                    <Trophy size={18} className="text-brand-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-100 font-[family-name:var(--font-display)]">{r.cefr_level}</span>
                      <Badge color={CEFR_MAP[r.cefr_level]?.color || 'brand'}>{CEFR_MAP[r.cefr_level]?.label || r.cefr_level}</Badge>
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {new Date(r.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-brand-400 font-[family-name:var(--font-display)]">
                    {r.score}/{r.total}
                  </span>
                  <ChevronRight size={16} className="text-ink-500" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Bottom spacing for nav ── */}
      <div className="h-4" />
    </div>
  );
}
