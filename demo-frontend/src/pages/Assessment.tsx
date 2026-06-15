import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import Loading from '../components/Loading';
import ErrorAlert from '../components/ErrorAlert';
import { ArrowLeft, Sparkles } from 'lucide-react';

interface Question {
  id: string; type: string; prompt: string;
  options?: Array<{ key: string; text: string }>;
}

interface AssessmentResult {
  cefr_level: string;
  listening_score: number;
  reading_score: number;
  speaking_score: number;
  writing_score: number;
  grammar_score: number;
  recommendations: string[];
}

export default function Assessment() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AssessmentResult | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getQuestions(token)
      .then(qs => {
        const shuffled = qs.sort(() => Math.random() - 0.5).slice(0, 10);
        setQuestions(shuffled);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAnswer = (answer: string) => {
    const q = questions[currentIdx];
    setAnswers(prev => ({ ...prev, [q.id]: answer }));
    if (currentIdx < questions.length - 1) {
      setTimeout(() => setCurrentIdx(currentIdx + 1), 250);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const answerList = questions.map(q => ({
        question_id: q.id,
        user_answer: answers[q.id] || '',
      }));
      const res = await api.submitAssessment(token!, answerList);
      setResult(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorAlert message={error} onRetry={() => window.location.reload()} /></div>;

  if (result) {
    const avgScore = Math.round(
      (result.listening_score + result.reading_score + result.speaking_score + result.writing_score + result.grammar_score) / 5
    );
    const levelColors: Record<string, string> = {
      A1: '#10b981', A2: '#22c55e', B1: '#eab308', B2: '#f97316', C1: '#ef4444', C2: '#a855f7',
    };
    const levelColor = levelColors[result.cefr_level] || '#60a5fa';

    return (
      <div className="page">
        {/* Level badge */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-3 mx-auto"
            style={{ background: `${levelColor}20` }}>
            <Sparkles size={36} style={{ color: levelColor }} />
          </div>
          <h2 className="text-xl font-bold mb-1">评测完成！</h2>
          <p className="text-4xl font-bold mb-2" style={{ color: levelColor }}>{result.cefr_level}</p>
          <p className="text-surface-400 text-sm">综合得分 {avgScore}/100</p>
        </div>

        {/* Score breakdown */}
        <div className="space-y-2 mb-6">
          {[
            ['👂 听力', result.listening_score],
            ['📖 阅读', result.reading_score],
            ['🎤 口语', result.speaking_score],
            ['✍️ 写作', result.writing_score],
            ['📐 语法', result.grammar_score],
          ].map(([label, score]) => (
            <div key={label as string} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-800">
              <span className="text-sm text-surface-300">{label}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-surface-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${score}%`, background: levelColor }}
                  />
                </div>
                <span className="text-sm font-semibold text-surface-200 w-6 text-right">{score}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Recommendations */}
        {result.recommendations && result.recommendations.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-primary-600/10 border border-primary-600/20">
            <p className="text-xs text-primary-400 mb-2 font-semibold uppercase tracking-wide">学习建议</p>
            <ul className="space-y-1">
              {result.recommendations.map((r, i) => (
                <li key={i} className="text-sm text-surface-300 flex gap-2">
                  <span className="text-primary-400 shrink-0">{i + 1}.</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={() => navigate('/')} className="btn-primary">
          返回首页
        </button>
      </div>
    );
  }

  const q = questions[currentIdx];
  if (!q) return null;
  const answered = answers[q.id];
  const isLast = currentIdx === questions.length - 1;

  return (
    <div className="page">
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-1">
          <ArrowLeft size={20} className="text-surface-400" />
        </button>
        <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-surface-400">{currentIdx + 1}/{questions.length}</span>
      </div>

      {/* Question */}
      <p className="text-xs text-surface-500 mb-2 uppercase tracking-wide">CEFR 水平测试 · 选择题</p>
      <h2 className="text-lg font-semibold mb-6 leading-relaxed">{q.prompt}</h2>

      {/* Options */}
      <div className="space-y-2.5">
        {(q.options || []).map(opt => {
          const selected = answered === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => handleAnswer(opt.key)}
              className={`w-full text-left px-4 py-4 rounded-xl border transition-all text-sm ${
                selected
                  ? 'border-primary-500 bg-primary-600/15 text-primary-300 shadow-lg shadow-primary-500/10'
                  : 'border-surface-600 bg-surface-800 hover:border-surface-500 active:bg-surface-700'
              }`}
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-surface-700 text-xs font-bold mr-3">
                {opt.key}
              </span>
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>

      {/* Submit (only on last question + answered) */}
      {isLast && answered && (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-primary mt-8"
        >
          {submitting ? '提交中...' : '提交评测'}
        </button>
      )}

      {/* Dot navigation */}
      <div className="flex justify-center gap-1.5 mt-8">
        {questions.map((_, i) => {
          const a = answers[questions[i].id];
          return (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={`rounded-full transition-all ${
                i === currentIdx
                  ? 'bg-primary-500 w-4 h-2'
                  : a
                  ? 'bg-primary-500/40 w-2 h-2'
                  : 'bg-surface-600 w-2 h-2'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
