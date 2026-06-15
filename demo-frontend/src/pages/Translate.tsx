import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeftRight, Loader2, Copy, Volume2 } from 'lucide-react';

const BASE = '/api/v1';

export default function Translate() {
  const { token } = useAuth();
  const [text, setText] = useState('');
  const [direction, setDirection] = useState<'zh2en' | 'en2zh'>('zh2en');
  const [result, setResult] = useState<{ translation: string; explanation?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTranslate = async () => {
    if (!text.trim() || !token) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${BASE}/llm/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ text: text.trim(), direction }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      // Read SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullTranslation = '';

      // Show placeholder
      setResult({ translation: '' });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line === 'data: [DONE]') break;
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.delta) {
              fullTranslation += parsed.delta;
              setResult({ translation: fullTranslation });
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyText = (t: string) => {
    navigator.clipboard.writeText(t).catch(() => {});
  };

  const speak = (t: string, lang: string) => {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = lang;
      u.rate = 0.9;
      speechSynthesis.speak(u);
    }
  };

  return (
    <div className="page space-y-4">
      <h1 className="text-lg font-bold">翻译</h1>

      {/* Direction switch */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${direction === 'zh2en' ? 'text-white' : 'text-surface-400'}`}>
          中 → 英
        </span>
        <button
          onClick={() => setDirection(d => d === 'zh2en' ? 'en2zh' : 'zh2en')}
          className="p-2 rounded-full bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ArrowLeftRight size={18} className="text-primary-400" />
        </button>
        <span className={`text-sm font-medium ${direction === 'en2zh' ? 'text-white' : 'text-surface-400'}`}>
          英 → 中
        </span>
      </div>

      {/* Input */}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={direction === 'zh2en' ? '输入中文...' : 'Enter English...'}
        rows={4}
        className="input-field resize-none"
      />

      <button
        onClick={handleTranslate}
        disabled={!text.trim() || loading}
        className="btn-primary"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> 翻译中...
          </span>
        ) : '翻 译'}
      </button>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card space-y-3 animate-in">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs text-surface-400 mb-1">
                {direction === 'zh2en' ? '英文翻译' : '中文翻译'}
              </p>
              <p className="text-base font-medium leading-relaxed">{result.translation}</p>
            </div>
            <div className="flex gap-1 ml-2">
              <button onClick={() => copyText(result.translation)} className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors">
                <Copy size={15} className="text-surface-400" />
              </button>
              <button onClick={() => speak(result.translation, direction === 'zh2en' ? 'en-US' : 'zh-CN')} className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors">
                <Volume2 size={15} className="text-surface-400" />
              </button>
            </div>
          </div>

          {result.explanation && (
            <div className="border-t border-surface-700 pt-3">
              <p className="text-xs text-surface-400 mb-1">词汇解析</p>
              <p className="text-sm text-surface-300 leading-relaxed">{result.explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
