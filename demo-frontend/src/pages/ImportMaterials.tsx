import { useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  ArrowLeft, Upload, FileText, Link2, Type, BookOpen,
  Loader2, CheckCircle2, AlertCircle, Sparkles, ChevronDown, ChevronUp,
  Volume2, Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BASE = '/api/v1';

type TabType = 'text' | 'url' | 'pdf';

interface WordItem {
  word: string;
  translation: string;
  cefr_level: string;
  part_of_speech: string;
  example_sentence: string;
  topic_tags: string[];
  difficulty_for_user: string;
}

interface ImportResult {
  title: string;
  source_type: string;
  source_text: string;
  total_words_found: number;
  total_analyzed: number;
  too_easy: WordItem[];
  recommended: WordItem[];
  too_hard: WordItem[];
  learning_plan: string;
}

const CEFR_COLORS: Record<string, string> = {
  'A1': 'bg-green-600/10 text-green-400 border-green-500/30',
  'A2': 'bg-emerald-600/10 text-emerald-400 border-emerald-500/30',
  'B1': 'bg-blue-600/10 text-blue-400 border-blue-500/30',
  'B2': 'bg-purple-600/10 text-purple-400 border-purple-500/30',
  'C1': 'bg-orange-600/10 text-orange-400 border-orange-500/30',
  'C2': 'bg-red-600/10 text-red-400 border-red-500/30',
};

export default function ImportMaterials() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabType>('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showPlan, setShowPlan] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());
  const [addingWord, setAddingWord] = useState('');

  // Text input
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');

  // URL input
  const [url, setUrl] = useState('');

  const [loadingText, setLoadingText] = useState('');

  // Multi-layer URL fetching: own server proxy first (can access China sites),
  // then public CORS proxies, then direct fetch as last resort.
  const fetchUrlContent = async (targetUrl: string): Promise<{ text: string; title: string }> => {
    // Strategy 1: Own server-side proxy (can access China-hosted sites that CORS proxies block)
    try {
      setLoadingText('正在通过服务器抓取网页...');
      const proxyRes = await fetch(
        `${BASE}/proxy/fetch?url=${encodeURIComponent(targetUrl)}`,
        { signal: AbortSignal.timeout(18000), headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        if (data.html && data.html.length > 200) {
          const stripped = data.html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#\d+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 10000);
          const titleMatch = data.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : new URL(targetUrl).hostname;
          return { text: stripped, title };
        }
      }
    } catch {
      // Server proxy failed, continue to next strategy
    }

    // Strategy 2: Public CORS proxies
    const proxies = [
      (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    ];

    for (let i = 0; i < proxies.length; i++) {
      try {
        setLoadingText(`正在抓取网页 (备用代理${i + 1})...`);
        const proxyUrl = proxies[i](targetUrl);
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000), headers: { 'Accept': 'text/html' } });
        if (!res.ok) continue;
        const html = await res.text();
        if (html.length < 200) continue;

        const stripped = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 10000);

        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : new URL(targetUrl).hostname;

        return { text: stripped, title };
      } catch {}
    }

    // Strategy 3: Direct fetch (last resort, CORS-dependent)
    try {
      setLoadingText('正在直接抓取网页...');
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const html = await res.text();
        if (html.length > 200) {
          const stripped = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 10000);
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : new URL(targetUrl).hostname;
          return { text: stripped, title };
        }
      }
    } catch {}

    throw new Error('所有抓取方式均失败。建议直接粘贴文章文本到"文本"标签页。');
  };

  const handleImport = async () => {
    if (!token) { setError('请先登录'); return; }
    setLoading(true); setError(''); setResult(null);

    try {
      const formData = new FormData();
      let endpoint = BASE + '/import/text';
      let displayTitle = title || '手动输入';

      if (tab === 'text') {
        if (!text.trim()) { setError('请输入文本内容'); setLoading(false); return; }
        setLoadingText('正在分析词汇...');
        formData.append('text', text);
        formData.append('title', displayTitle);
      } else if (tab === 'url') {
        if (!url.trim()) { setError('请输入网页链接'); setLoading(false); return; }
        // Fetch URL from browser side to bypass server network restrictions
        setError(''); // clear previous errors
        const fetched = await fetchUrlContent(url);
        if (!fetched.text) { setError('网页内容为空，无法分析'); setLoading(false); return; }
        formData.append('text', fetched.text);
        formData.append('title', fetched.title);
        setTitle(fetched.title); // show the fetched title in results
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || '导入失败');
    } finally {
      setLoading(false);
    }
  };

  // Add a single word to user's vocabulary bank
  const addToBank = async (card: WordItem) => {
    if (!token || addedWords.has(card.word)) return;
    setAddingWord(card.word);
    try {
      const res = await fetch(BASE + '/wordbank/add-to-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ words: [{ word: card.word, translation: card.translation, phonetic: (card as any).phonetic || '', part_of_speech: card.part_of_speech, cefr_level: card.cefr_level, example_sentence: card.example_sentence, example_translation: (card as any).example_translation || '', topic_tags: card.topic_tags, source: 'import' }] }),
      });
      if (res.ok) setAddedWords(prev => new Set([...prev, card.word]));
    } catch {}
    setAddingWord('');
  };

  const speakWord = (word: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(word);
      utter.lang = 'en-US';
      utter.rate = 0.8;
      window.speechSynthesis.speak(utter);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setLoading(true); setError(''); setResult(null);
    setLoadingText('正在解析PDF...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(BASE + '/import/pdf', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'PDF解析失败');
    } finally {
      setLoading(false);
    }
  };

  const wordCard = (w: WordItem) => {
    const isAdded = addedWords.has(w.word);
    const isAdding = addingWord === w.word;
    return (
    <div key={w.word} className="flex items-start gap-3 p-3 rounded-xl bg-surface-800 border border-surface-700">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 mt-0.5 ${CEFR_COLORS[w.cefr_level] || 'bg-surface-700 text-surface-300'}`}>
        {w.cefr_level}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{w.word}</span>
          <span className="text-xs text-surface-400">{w.part_of_speech}</span>
          <button onClick={() => speakWord(w.word)} className="p-0.5 text-surface-500 hover:text-primary-400 transition-colors" title="发音">
            <Volume2 size={13} />
          </button>
        </div>
        {(w as any).phonetic && <p className="text-[11px] text-surface-500 mt-0.5">{(w as any).phonetic}</p>}
        <p className="text-xs text-surface-400 mt-0.5">{w.translation}</p>
        <p className="text-xs text-surface-500 mt-1 italic leading-relaxed">{w.example_sentence}</p>
        {(w as any).example_translation && (
          <p className="text-[11px] text-surface-600 mt-0.5">{(w as any).example_translation}</p>
        )}
      </div>
      <button
        onClick={() => addToBank(w)}
        disabled={isAdded || !!isAdding}
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
          isAdded ? 'bg-green-600/20 text-green-400' : 'bg-surface-700 hover:bg-primary-600 text-surface-400 hover:text-white'
        }`}
        title="加入生词库"
      >
        {isAdded ? <CheckCircle2 size={14} /> : isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
      </button>
    </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-900">
      <div className="px-4 py-3 border-b border-surface-700 bg-surface-900/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} className="text-surface-400" /></button>
          <div><h1 className="text-base font-semibold flex items-center gap-2"><BookOpen size={18} />导入学习资料</h1></div>
        </div>
      </div>

      <div className="px-4 py-4">
        {!result ? (
          <>
            {/* Tab selector */}
            <div className="flex bg-surface-800 rounded-xl p-1 mb-4">
              {[
                { id: 'text', label: '文本', icon: Type },
                { id: 'url', label: '网页链接', icon: Link2 },
                { id: 'pdf', label: 'PDF文件', icon: FileText },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id as TabType)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all
                    ${tab === t.id ? 'bg-primary-600 text-white shadow' : 'text-surface-400 hover:text-surface-200'}`}>
                  <t.icon size={14} />{t.label}
                </button>
              ))}
            </div>

            {/* Text Input */}
            {tab === 'text' && (
              <div className="space-y-3">
                <input type="text" placeholder="标题（可选）" value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500" />
                <textarea placeholder="在此粘贴文章内容、论文段落或任何英语文本..." value={text} onChange={e => setText(e.target.value)}
                  className="w-full h-52 bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 resize-none" />
              </div>
            )}

            {/* URL Input */}
            {tab === 'url' && (
              <div className="space-y-3">
                <input type="url" placeholder="https://example.com/article" value={url} onChange={e => setUrl(e.target.value)}
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500" />
                <p className="text-xs text-surface-500">输入英文文章的链接，AI将自动抓取内容并分析词汇（通过浏览器端获取，不受服务器网络限制）</p>
              </div>
            )}

            {/* PDF Upload */}
            {tab === 'pdf' && (
              <div className="space-y-3">
                <div onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-surface-700 rounded-xl p-10 text-center cursor-pointer hover:border-primary-500/50 transition-colors">
                  <Upload size={32} className="mx-auto text-surface-400 mb-3" />
                  <p className="text-sm text-surface-300 mb-1">点击上传 PDF 文件</p>
                  <p className="text-xs text-surface-500">支持英文论文、报告、文章等</p>
                </div>
                <input ref={fileRef} type="file" accept=".pdf" onChange={handleFileUpload} hidden />
              </div>
            )}

            {/* Submit */}
            {tab !== 'pdf' && (
              <button onClick={handleImport} disabled={loading}
                className="w-full mt-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:bg-surface-700 disabled:text-surface-400 font-medium transition-all flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={16} className="animate-spin" /> {loadingText || '分析中...'}</> : <><Sparkles size={16} /> AI 分析词汇</>}
              </button>
            )}

            {loading && tab === 'pdf' && (
              <div className="mt-4 flex items-center justify-center gap-2 py-4 text-surface-400">
                <Loader2 size={16} className="animate-spin" /> {loadingText}
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-300">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />{error}
              </div>
            )}
          </>
        ) : (
          /* Results */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">{result.title}</h2>
              <span className="text-xs text-surface-400">{result.total_analyzed} 个词汇分析</span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-green-600/10 border border-green-500/20 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-green-400">{result.recommended.length}</div>
                <div className="text-[10px] text-green-400/80 mt-0.5">推荐学习</div>
              </div>
              <div className="bg-surface-800 border border-surface-700 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-surface-300">{result.too_easy.length}</div>
                <div className="text-[10px] text-surface-500 mt-0.5">已掌握</div>
              </div>
              <div className="bg-orange-600/10 border border-orange-500/20 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-orange-400">{result.too_hard.length}</div>
                <div className="text-[10px] text-orange-400/80 mt-0.5">较难</div>
              </div>
            </div>

            {/* Learning Plan */}
            {result.learning_plan && (
              <div className="bg-primary-600/5 border border-primary-500/20 rounded-xl overflow-hidden">
                <button onClick={() => setShowPlan(!showPlan)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium">
                  <span className="flex items-center gap-2"><Sparkles size={14} className="text-primary-400" />AI 学习计划</span>
                  {showPlan ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showPlan && (
                  <div className="px-4 pb-4 text-xs text-surface-300 leading-relaxed whitespace-pre-wrap">
                    {result.learning_plan}
                  </div>
                )}
              </div>
            )}

            {/* Recommended words */}
            {result.recommended.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <CheckCircle2 size={12} />推荐学习词汇
                </h3>
                <div className="space-y-2">{result.recommended.map(wordCard)}</div>
              </div>
            )}

            {/* Easy words (collapsed) */}
            {result.too_easy.length > 0 && (
              <details className="group">
                <summary className="text-xs text-surface-500 cursor-pointer py-1">已掌握 {result.too_easy.length} 个</summary>
                <div className="space-y-2 mt-2">{result.too_easy.map(wordCard)}</div>
              </details>
            )}

            <button onClick={() => setResult(null)}
              className="w-full py-3 rounded-xl border border-surface-700 text-sm text-surface-400 hover:text-surface-200 transition-colors mt-2">
              继续导入
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
