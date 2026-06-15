import { useState, useMemo, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button, Badge, ProgressBar, Card } from '../components/ui';
import {
  GraduationCap, Briefcase, Plane, Target,
  Sparkles, ArrowRight, CheckCircle2, Trophy,
  ChevronRight, ShieldCheck,
} from 'lucide-react';

type Identity = 'student' | 'professional' | 'traveler' | 'other';
type CEFR = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type Step = 1 | 2 | 3;

interface Question {
  id: number;
  text: string;
  options: string[];
  answer: number;
}

interface PathItem {
  icon: ComponentType<{ size?: number }>;
  label: string;
  freq: string;
  color: 'brand' | 'sage' | 'blue';
}

const IDENTITIES: { value: Identity; label: string; desc: string; icon: typeof GraduationCap; iconColor: string }[] = [
  { value: 'student', label: '留学生', desc: '海外学习场景', icon: GraduationCap, iconColor: 'text-brand-400' },
  { value: 'professional', label: '职场人', desc: '商务英语需求', icon: Briefcase, iconColor: 'text-blue-400' },
  { value: 'traveler', label: '旅行者', desc: '旅行日常交流', icon: Plane, iconColor: 'text-sage-400' },
  { value: 'other', label: '其他', desc: '自定义学习目标', icon: Target, iconColor: 'text-purple-400' },
];

const CEFR_MAP: Record<CEFR, { label: string; color: 'sage' | 'brand' | 'blue' | 'purple' | 'red' | 'amber'; desc: string }> = {
  A1: { label: '入门', color: 'sage', desc: '掌握基础问候与简单表达' },
  A2: { label: '基础', color: 'sage', desc: '能进行日常简单对话' },
  B1: { label: '中级', color: 'blue', desc: '能独立应对常见场景' },
  B2: { label: '中高级', color: 'purple', desc: '能流畅表达观点与讨论' },
  C1: { label: '高级', color: 'amber', desc: '接近母语级别的理解力' },
  C2: { label: '精通', color: 'red', desc: '完全掌握，如母语者' },
};

const QUESTIONS: Question[] = [
  { id: 1, text: 'I usually ______ coffee in the morning.', options: ['drink', 'drinks', 'drinking', 'drank'], answer: 0 },
  { id: 2, text: 'She has been working here ______ 2020.', options: ['for', 'since', 'from', 'in'], answer: 1 },
  { id: 3, text: 'If it rains tomorrow, we ______ at home.', options: ['stay', 'stayed', 'will stay', 'would stay'], answer: 2 },
  { id: 4, text: 'The book ______ by the time I arrived.', options: ['was sold', 'had been sold', 'has been sold', 'is sold'], answer: 1 },
  { id: 5, text: 'I wish I ______ more time to travel.', options: ['had', 'have', 'will have', 'would have'], answer: 0 },
  { id: 6, text: 'He asked me where ______.', options: ['I live', 'did I live', 'I lived', 'do I live'], answer: 2 },
  { id: 7, text: 'This is the ______ movie I have ever seen.', options: ['good', 'better', 'best', 'most good'], answer: 2 },
  { id: 8, text: 'You ______ be tired after such a long journey.', options: ['must', 'should', 'can', 'would'], answer: 0 },
  { id: 9, text: 'Despite ______ hard, he failed the exam.', options: ['study', 'studied', 'studying', 'to study'], answer: 2 },
  { id: 10, text: 'Not until the meeting started ______ the problem.', options: ['he realized', 'did he realize', 'he realize', 'realized he'], answer: 1 },
];

const PATH_RECOMMENDATIONS: Record<CEFR, PathItem[]> = {
  A1: [
    { icon: MessageCircleIcon, label: 'AI 对话', freq: '每日 10 分钟', color: 'brand' },
    { icon: CameraIcon, label: '场景录', freq: '每周 2 次', color: 'sage' },
    { icon: BookOpenIcon, label: '单词摘录', freq: '每日 5 个', color: 'blue' },
  ],
  A2: [
    { icon: MessageCircleIcon, label: 'AI 对话', freq: '每日 15 分钟', color: 'brand' },
    { icon: CameraIcon, label: '场景录', freq: '每周 3 次', color: 'sage' },
    { icon: BookOpenIcon, label: '单词摘录', freq: '每日 8 个', color: 'blue' },
  ],
  B1: [
    { icon: MessageCircleIcon, label: 'AI 对话', freq: '每日 15 分钟', color: 'brand' },
    { icon: CameraIcon, label: '场景录', freq: '每周 3 次', color: 'sage' },
    { icon: BookOpenIcon, label: '单词摘录', freq: '每日 10 个', color: 'blue' },
  ],
  B2: [
    { icon: MessageCircleIcon, label: 'AI 对话', freq: '每日 20 分钟', color: 'brand' },
    { icon: RadioIcon, label: '同声传译', freq: '每周 2 次', color: 'sage' },
    { icon: BookOpenIcon, label: '单词摘录', freq: '每日 15 个', color: 'blue' },
  ],
  C1: [
    { icon: RadioIcon, label: '同声传译', freq: '每日 15 分钟', color: 'brand' },
    { icon: MessageCircleIcon, label: 'AI 深度对话', freq: '每周 4 次', color: 'sage' },
    { icon: CameraIcon, label: '场景录', freq: '每周 2 次', color: 'blue' },
  ],
  C2: [
    { icon: RadioIcon, label: '同声传译', freq: '每日 20 分钟', color: 'brand' },
    { icon: MessageCircleIcon, label: 'AI 深度对话', freq: '每日 15 分钟', color: 'sage' },
    { icon: CameraIcon, label: '自由创作', freq: '每周 3 次', color: 'blue' },
  ],
};

// Icon wrappers for path items
function MessageCircleIcon({ size }: { size?: number }) {
  return <svg width={size || 20} height={size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
}
function CameraIcon({ size }: { size?: number }) {
  return <svg width={size || 20} height={size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>;
}
function BookOpenIcon({ size }: { size?: number }) {
  return <svg width={size || 20} height={size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>;
}
function RadioIcon({ size }: { size?: number }) {
  return <svg width={size || 20} height={size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/></svg>;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const score = answers.filter((a, i) => a === QUESTIONS[i].answer).length;
  const cefrLevel: CEFR = useMemo(() => {
    const pct = score / QUESTIONS.length;
    if (pct >= 0.9) return 'C2';
    if (pct >= 0.8) return 'C1';
    if (pct >= 0.65) return 'B2';
    if (pct >= 0.45) return 'B1';
    if (pct >= 0.25) return 'A2';
    return 'A1';
  }, [score]);
  const cefr = CEFR_MAP[cefrLevel];
  const paths = PATH_RECOMMENDATIONS[cefrLevel];

  const handleIdentitySelect = (id: Identity) => {
    setIdentity(id);
  };

  const goToStep2 = () => {
    if (!identity) return;
    try {
      localStorage.setItem('lingualearn_identity', identity);
    } catch(e) { console.error('Failed to save onboarding identity:', e); }
    setStep(2);
  };

  const handleAnswer = (idx: number) => {
    if (showResult) return;
    setSelectedAnswer(idx);
    setTimeout(() => {
      setAnswers(prev => [...prev, idx]);
      setSelectedAnswer(null);
      if (currentQ < QUESTIONS.length - 1) {
        setCurrentQ(prev => prev + 1);
      } else {
        setShowResult(true);
      }
    }, 600);
  };

  const handleFinish = () => {
    try {
      localStorage.setItem('lingualearn_onboarding_done', 'true');
      localStorage.setItem('lingualearn_cefr', cefrLevel);
    } catch(e) { console.error('Failed to save onboarding state:', e); }
    navigate('/', { replace: true });
  };

  const isCorrect = selectedAnswer !== null && selectedAnswer === QUESTIONS[currentQ].answer;
  const isWrong = selectedAnswer !== null && selectedAnswer !== QUESTIONS[currentQ].answer;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-ink-950">
      {/* Header with step indicator */}
      <header className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  s < step ? 'bg-sage-400' : s === step ? 'bg-brand-400' : 'bg-ink-700'
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-medium text-ink-400 font-[family-name:var(--font-display)] tracking-wider">
            Step {step} / 3
          </span>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1 h-1 rounded-full overflow-hidden bg-ink-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out-expo ${
                  s < step ? 'bg-sage-400' : s === step ? 'bg-brand-400' : ''
                }`}
                style={{ width: s < step ? '100%' : s === step ? '100%' : '0%' }}
              />
            </div>
          ))}
        </div>
      </header>

      {/* Step 1: Identity Selection */}
      {step === 1 && (
        <div className="flex-1 flex flex-col px-5">
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                <Target size={16} className="text-brand-400" />
              </div>
              <Badge color="brand" dot>选择身份</Badge>
            </div>
            <h1 className="text-2xl font-bold text-ink-100 font-[family-name:var(--font-display)] leading-tight">
              你的学习身份
            </h1>
            <p className="text-sm text-ink-400 mt-1.5 leading-relaxed">
              AI 将据此为你量身定制学习路径与内容
            </p>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-3 mt-6 stagger">
            {IDENTITIES.map(({ value, label, desc, icon: Icon, iconColor }) => (
              <button
                key={value}
                onClick={() => handleIdentitySelect(value)}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 text-left ${
                  identity === value
                    ? 'border-brand-500/40 bg-brand-500/5 shadow-inner-glow'
                    : 'border-ink-700/50 bg-ink-800/40 hover:border-brand-500/20 hover:bg-ink-800/60'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  identity === value
                    ? 'bg-brand-500/15 border border-brand-500/25'
                    : 'bg-ink-800/80 border border-ink-700/40'
                }`}>
                  <Icon size={22} className={identity === value ? 'text-brand-400' : iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold font-[family-name:var(--font-display)] ${
                    identity === value ? 'text-brand-300' : 'text-ink-200'
                  }`}>{label}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{desc}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  identity === value
                    ? 'border-brand-400 bg-brand-400'
                    : 'border-ink-600'
                }`}>
                  {identity === value && <CheckCircle2 size={12} className="text-ink-950" />}
                </div>
              </button>
            ))}
          </div>

          <div className="pb-8 pt-4">
            <Button
              variant="primary"
              size="xl"
              fullWidth
              disabled={!identity}
              onClick={goToStep2}
              icon={<ArrowRight size={18} />}
            >
              下一步
            </Button>
            <p className="text-center text-xs text-ink-500 mt-3">
              你的选择将帮助我们个性化学习体验
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Quick Assessment */}
      {step === 2 && !showResult && (
        <div className="flex-1 flex flex-col px-5">
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Sparkles size={16} className="text-blue-400" />
              </div>
              <Badge color="blue" dot>能力评测</Badge>
            </div>
            <h2 className="text-lg font-bold text-ink-100 font-[family-name:var(--font-display)]">
              快速测试你的英语水平
            </h2>
            <p className="text-xs text-ink-400 mt-1">第 {currentQ + 1} 题 / 共 {QUESTIONS.length} 题</p>

            <div className="mt-3 mb-6">
              <ProgressBar value={currentQ} max={QUESTIONS.length} color="brand" size="sm" />
            </div>
          </div>

          <Card variant="glow" padding="lg" className="animate-fade-in-up">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold text-ink-400 font-[family-name:var(--font-display)] tracking-wider bg-ink-700/50 px-2.5 py-1 rounded-lg">
                Q{currentQ + 1}
              </span>
              <Badge color="gray">选择题</Badge>
            </div>
            <p className="text-base text-ink-100 leading-relaxed font-[family-name:var(--font-body)]">
              {QUESTIONS[currentQ].text}
            </p>
          </Card>

          <div className="flex-1 flex flex-col justify-center gap-2.5 mt-4 stagger">
            {QUESTIONS[currentQ].options.map((opt, i) => {
              let variant: 'secondary' | 'primary' | 'danger' | 'success' = 'secondary';
              if (showResult && selectedAnswer !== null) {
                if (i === QUESTIONS[currentQ].answer) variant = 'success';
                else if (i === selectedAnswer) variant = 'danger';
              } else if (selectedAnswer === i) {
                variant = 'primary';
              }

              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  disabled={selectedAnswer !== null}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left ${
                    selectedAnswer === i
                      ? isCorrect
                        ? 'border-sage-500/40 bg-sage-500/10'
                        : isWrong
                        ? 'border-red-500/30 bg-red-500/10'
                        : 'border-brand-500/40 bg-brand-500/10'
                      : 'border-ink-700/50 bg-ink-800/40 hover:border-brand-500/20 hover:bg-ink-800/60 active:scale-[0.985]'
                  } ${selectedAnswer !== null && selectedAnswer !== i && i !== QUESTIONS[currentQ].answer ? 'opacity-50' : ''}`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-[family-name:var(--font-display)] shrink-0 transition-colors ${
                    selectedAnswer === i
                      ? isCorrect
                        ? 'bg-sage-500/20 text-sage-400 border border-sage-500/30'
                        : isWrong
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                      : 'bg-ink-700/60 text-ink-300 border border-ink-600/40'
                  }`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className={`text-sm ${
                    selectedAnswer === i
                      ? isCorrect ? 'text-sage-300' : isWrong ? 'text-red-300' : 'text-brand-200'
                      : 'text-ink-200'
                  }`}>{opt}</span>
                  {selectedAnswer !== null && i === QUESTIONS[currentQ].answer && (
                    <CheckCircle2 size={16} className="text-sage-400 ml-auto shrink-0" />
                  )}
                  {isWrong && selectedAnswer === i && (
                    <span className="text-xs text-red-400 ml-auto">&#10005;</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2 Result / Step 3: AI Recommendation */}
      {(step === 2 && showResult) || step === 3 ? (
        <div className="flex-1 flex flex-col px-5 animate-fade-in-up">
          <div className="text-center mb-1">
            <div className="w-16 h-16 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-3">
              <Trophy size={28} className="text-brand-400" />
            </div>
            <Badge color={cefr.color} dot>{cefr.label}</Badge>
          </div>

          <Card variant="glow" padding="lg" className="text-center mb-4">
            <div className="w-20 h-20 rounded-full bg-brand-500/10 border-2 border-brand-500/25 flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl font-extrabold text-brand-400 font-[family-name:var(--font-display)]">
                {cefrLevel}
              </span>
            </div>
            <h2 className="text-lg font-bold text-ink-100 font-[family-name:var(--font-display)]">
              你的 CEFR 等级
            </h2>
            <p className="text-sm text-ink-400 mt-1">{cefr.desc}</p>
            <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-ink-700/50">
              <div className="text-center">
                <p className="text-lg font-bold text-brand-400 font-[family-name:var(--font-display)]">{score}/{QUESTIONS.length}</p>
                <p className="text-xs text-ink-500">正确率</p>
              </div>
              <div className="w-px h-8 bg-ink-700/50" />
              <div className="text-center">
                <p className="text-lg font-bold text-sage-400 font-[family-name:var(--font-display)]">{Math.round(score / QUESTIONS.length * 100)}%</p>
                <p className="text-xs text-ink-500">准确度</p>
              </div>
            </div>
          </Card>

          <div className="mb-4">
            <h3 className="text-sm font-semibold text-ink-200 font-[family-name:var(--font-display)] flex items-center gap-2 mb-3">
              <ShieldCheck size={15} className="text-brand-400" />
              推荐学习路径
            </h3>
            <div className="space-y-2 stagger">
              {paths.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 ${
                    i === 0
                      ? 'border-brand-500/15 bg-brand-500/5'
                      : 'border-ink-700/50 bg-ink-800/40'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    i === 0
                      ? 'bg-brand-500/15 border border-brand-500/25'
                      : 'bg-ink-800/80 border border-ink-700/40'
                  }`}>
                    <item.icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-200 font-[family-name:var(--font-display)]">
                      {item.label}
                    </p>
                    <p className="text-xs text-ink-500">{item.freq}</p>
                  </div>
                  <Badge color={i === 0 ? 'brand' : 'gray'}>{i === 0 ? '优先' : '建议'}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="pb-8 pt-2">
            <Button
              variant="primary"
              size="xl"
              fullWidth
              onClick={handleFinish}
              icon={<Sparkles size={18} />}
            >
              开始学习
            </Button>
            <p className="text-center text-xs text-ink-500 mt-3">
              评测结果已保存，你可以在个人资料中重新评测
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
