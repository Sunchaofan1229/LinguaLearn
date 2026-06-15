import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, Badge, Input, EmptyState, Skeleton, ProgressBar } from '../components/ui';
import { BookOpen, Search, GraduationCap, CheckCircle2, Filter, TrendingUp } from 'lucide-react';

interface WordProgress {
  word: string;
  translation: string;
  cefr_level: string;
  topic: string;
  status: 'new' | 'learning' | 'practicing' | 'mastered';
  correct_uses: number;
  next_review: string | null;
}

interface WordStats {
  total: number;
  mastered: number;
  learning: number;
  new_count: number;
  by_level: Record<string, number>;
}

type CefrColor = 'sage' | 'blue' | 'purple' | 'amber' | 'red';

const CEFR_COLORS: Record<string, CefrColor> = {
  A1: 'sage', A2: 'sage', B1: 'blue', B2: 'purple', C1: 'amber', C2: 'red',
};

const STATUS_CONFIG: Record<string, { label: string; color: 'blue' | 'purple' | 'amber' | 'sage' }> = {
  new: { label: '新词', color: 'blue' },
  learning: { label: '学习中', color: 'purple' },
  practicing: { label: '练习中', color: 'amber' },
  mastered: { label: '已掌握', color: 'sage' },
};

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'new', label: '新词' },
  { value: 'learning', label: '学习中' },
  { value: 'practicing', label: '练习中' },
  { value: 'mastered', label: '已掌握' },
];

export default function WordBank() {
  const { token } = useAuth();
  const [words, setWords] = useState<WordProgress[]>([]);
  const [stats, setStats] = useState<WordStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [queueRes, statsRes] = await Promise.all([
        fetch('/api/v1/wordbank/queue', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/v1/wordbank/stats', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const queueData = await queueRes.json();
      const statsData = await statsRes.json();
      if (queueData.words) setWords(queueData.words);
      if (statsData) setStats(statsData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [token]);

  const markProgress = async (word: string, status: string) => {
    if (!token) return;
    try {
      await fetch('/api/v1/wordbank/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ word, status }),
      });
      fetchData();
    } catch {}
  };

  const filtered = words.filter(w => {
    const matchSearch = w.word.toLowerCase().includes(search.toLowerCase()) ||
      (w.translation && w.translation.includes(search));
    const matchFilter = filter === 'all' || w.status === filter;
    return matchSearch && matchFilter;
  });

  const levelOrder: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
  filtered.sort((a, b) => {
    if (a.cefr_level !== b.cefr_level) return (levelOrder[a.cefr_level] || 3) - (levelOrder[b.cefr_level] || 3);
    const statusOrder: Record<string, number> = { new: 0, learning: 1, practicing: 2, mastered: 3 };
    return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
  });

  const masteryPct = stats?.total ? Math.round((stats.mastered / stats.total) * 100) : 0;

  return (
    <div className="page animate-fade-in space-y-5">
      {/* ── Header ── */}
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-100 flex items-center gap-2.5 font-[family-name:var(--font-display)]">
          <BookOpen size={20} className="text-brand-400" />
          生词本
        </h1>
        {stats && (
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-sage-400" />
            <span className="text-xs font-semibold text-sage-400 font-[family-name:var(--font-display)]">
              {masteryPct}% 掌握
            </span>
          </div>
        )}
      </header>

      {/* ── Stats Overview ── */}
      {stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2.5">
            {[
              { label: '总量', value: stats.total, color: 'text-ink-100' },
              { label: '新词', value: stats.new_count || 0, color: 'text-blue-400' },
              { label: '学习', value: stats.learning || 0, color: 'text-purple-400' },
              { label: '掌握', value: stats.mastered || 0, color: 'text-sage-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-ink-800/70 border border-ink-700/50 rounded-2xl px-3 py-3 text-center">
                <p className={`text-xl font-bold font-[family-name:var(--font-display)] ${color}`}>{value}</p>
                <p className="text-[10px] text-ink-500 font-medium mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <ProgressBar value={masteryPct} color="sage" showLabel />
        </div>
      )}

      {/* ── Level Distribution ── */}
      {stats?.by_level && Object.keys(stats.by_level).length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => {
            const count = stats.by_level[level] || 0;
            return count > 0 ? (
              <Badge key={level} color={CEFR_COLORS[level] || 'blue'}>
                {level} · {count} 词
              </Badge>
            ) : null;
          })}
        </div>
      )}

      {/* ── Search & Filter ── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索单词..."
            className="input-field-sm !pl-9"
          />
        </div>
        <div className="flex rounded-xl bg-ink-800/80 border border-ink-700/50 p-0.5">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 font-[family-name:var(--font-display)] ${
                filter === value
                  ? 'bg-ink-700 text-white shadow-subtle'
                  : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Word List ── */}
      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="card py-3 flex items-center gap-3">
              <Skeleton width="55%" height={16} rounded="md" />
              <Skeleton width="25%" height={14} rounded="full" />
              <Skeleton width="15%" height={14} rounded="full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <Card padding="lg">
          <div className="text-center py-4">
            <p className="text-sm text-red-400 mb-3">{error}</p>
            <button onClick={fetchData} className="text-sm text-brand-400 hover:text-brand-300 font-[family-name:var(--font-display)]">
              重新加载
            </button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={search ? Search : GraduationCap}
          title={search ? '没有匹配的单词' : '生词本还是空的'}
          description={search ? '试试其他关键词' : '在对话中开启引导模式，AI 会自动提取生词'}
        />
      ) : (
        <div className="stagger space-y-2">
          {filtered.map((w, i) => {
            const status = STATUS_CONFIG[w.status];
            return (
              <div
                key={i}
                className="flex items-center justify-between bg-ink-800/70 border border-ink-700/40 rounded-2xl px-4 py-3
                           hover:border-ink-600/60 transition-all duration-200 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-ink-100 font-[family-name:var(--font-display)]">
                      {w.word}
                    </span>
                    <Badge color={CEFR_COLORS[w.cefr_level] || 'blue'}>{w.cefr_level}</Badge>
                    <Badge color={status.color}>{status.label}</Badge>
                  </div>
                  <p className="text-xs text-ink-500 truncate">{w.translation}</p>
                  {w.topic && w.topic !== 'general' && (
                    <span className="text-[10px] text-ink-600 mt-0.5 inline-block">#{w.topic}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {w.next_review && (
                    <span className="text-[9px] text-ink-600 opacity-0 group-hover:opacity-100 transition-opacity font-[family-name:var(--font-display)]">
                      复习: {new Date(w.next_review).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  {w.status !== 'mastered' && (
                    <button
                      onClick={() => markProgress(w.word, 'mastered')}
                      className="p-1.5 rounded-lg hover:bg-sage-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
                      title="标记为已掌握"
                    >
                      <CheckCircle2 size={16} className="text-sage-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
