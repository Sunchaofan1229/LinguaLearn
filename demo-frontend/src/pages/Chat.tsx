import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Badge, SegmentControl, Card, ProgressBar } from '../components/ui';
import {
  Send, Loader2, Sparkles, BookOpen, GraduationCap, ChevronDown, ChevronUp,
  X, Volume2, MessageSquare, Phone, Zap, Brain
} from 'lucide-react';
import VoiceMode from '../components/VoiceMode';

const BASE = '/api/v1';

interface Message {
  role: 'user' | 'bot';
  content: string;
}

interface ExtractedWord {
  word: string;
  translation: string;
  cefr_level: string;
  topic: string;
}

interface WordProgress {
  word: string;
  translation: string;
  cefr_level: string;
  status: 'new' | 'learning' | 'practicing' | 'mastered';
  correct_uses: number;
}

const TOPICS = ['自我介绍', '兴趣爱好', '旅行', '美食', '科技', '学习'];

const CEFR_COLORS: Record<string, 'sage' | 'blue' | 'purple' | 'amber' | 'red'> = {
  A1: 'sage', A2: 'sage', B1: 'blue', B2: 'purple', C1: 'amber', C2: 'red',
};

const STATUS_LABELS: Record<string, { label: string; color: 'sage' | 'blue' | 'purple' | 'amber' | 'brand' }> = {
  new: { label: '新词', color: 'blue' },
  learning: { label: '学习中', color: 'purple' },
  practicing: { label: '练习中', color: 'amber' },
  mastered: { label: '已掌握', color: 'sage' },
};

export default function Chat() {
  const { token, user } = useAuth();

  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', content: `Hi! I'm Luna, your English tutor. Let's practice together.\n\n你好，我是你的英语老师 Luna。今天想聊什么话题？` },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [guidedMode, setGuidedMode] = useState(false);
  const [showWordPanel, setShowWordPanel] = useState(false);
  const [extractedWords, setExtractedWords] = useState<ExtractedWord[]>([]);
  const [learningQueue, setLearningQueue] = useState<WordProgress[]>([]);
  const [wordStats, setWordStats] = useState({ total: 0, mastered: 0, learning: 0 });

  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/wordbank/queue`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.words) setLearningQueue(d.words);
        if (d.stats) setWordStats(d.stats);
      })
      .catch(() => {});
  }, [token]);

  const extractWords = async (conversation: string) => {
    if (!token || !guidedMode) return;
    try {
      const res = await fetch(`${BASE}/wordbank/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversation, cefr_level: user?.cefr_level || 'B1' }),
      });
      if (!res.ok) return;
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }
      for (const line of fullText.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.words) setExtractedWords(prev => {
            const existing = new Set(prev.map(w => w.word));
            return [...prev, ...parsed.words.filter((w: ExtractedWord) => !existing.has(w.word))];
          });
          if (parsed.queue) setLearningQueue(parsed.queue);
          if (parsed.stats) setWordStats(parsed.stats);
        } catch {}
      }
    } catch {}
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !token) return;
    const cefrLevel = user?.cefr_level || 'A1';
    conversationRef.current.push(`Student: ${text}`);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    setError('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      let endpoint = `${BASE}/llm/chat`;
      let body: any = { message: text, cefr_level: cefrLevel };
      if (guidedMode && learningQueue.length > 0) {
        endpoint = `${BASE}/llm/chat/guided`;
        body = {
          message: text, cefr_level: cefrLevel,
          target_words: learningQueue.filter(w => w.status !== 'mastered').slice(0, 4).map(w => w.word),
          topic: TOPICS[Math.floor(Math.random() * TOPICS.length)],
        };
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 401) { localStorage.removeItem('ll_token'); localStorage.removeItem('ll_user'); window.location.href = '/demo/'; return; }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullReply = '';
      setMessages(prev => [...prev, { role: 'bot', content: '' }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.delta) {
              fullReply += parsed.delta;
              setMessages(prev => { const copy = [...prev]; copy[copy.length - 1] = { role: 'bot', content: fullReply }; return copy; });
            }
          } catch {}
        }
      }
      conversationRef.current.push(`Tutor: ${fullReply}`);
      if (guidedMode && conversationRef.current.length >= 2) extractWords(conversationRef.current.slice(-2).join('\n'));
    } catch (err: any) {
      setError(err.message);
      setMessages(prev => [...prev, { role: 'bot', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  const markProgress = async (word: string, status: string) => {
    if (!token) return;
    try {
      await fetch(`${BASE}/wordbank/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ word, status }),
      });
      setWordStats(prev => ({ ...prev, mastered: status === 'mastered' ? prev.mastered + 1 : prev.mastered }));
    } catch {}
  };

  const speak = (text: string) => {
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'));
    if (en) u.voice = en;
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const activeWords = learningQueue.filter(w => w.status !== 'mastered');
  const masteryPct = wordStats.total > 0 ? Math.round((wordStats.mastered / wordStats.total) * 100) : 0;

  return (
    <div className="flex flex-col h-[100dvh] pb-20 animate-fade-in">
      {/* ── Header ── */}
      <header className="px-4 pt-4 pb-3 border-b border-ink-700/50 bg-ink-950/90 backdrop-blur-xl sticky top-0 z-10 space-y-3">
        <SegmentControl
          options={[
            { value: 'text', label: '文字对话', icon: <MessageSquare size={14} /> },
            { value: 'voice', label: '语音通话', icon: <Phone size={14} /> },
          ]}
          value={mode}
          onChange={(v) => setMode(v)}
        />

        {mode === 'text' && (
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-ink-200 font-[family-name:var(--font-display)]">
              {guidedMode ? '引导式学习' : 'AI 口语对话'}
            </h1>
            <button
              onClick={() => setGuidedMode(!guidedMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 font-[family-name:var(--font-display)] ${
                guidedMode
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  : 'bg-ink-800/60 text-ink-400 border border-ink-700/40 hover:text-ink-200 hover:border-ink-600'
              }`}
            >
              <GraduationCap size={13} />
              {guidedMode ? '引导模式 ON' : '自由对话'}
            </button>
          </div>
        )}
        {mode === 'text' && guidedMode && (
          <p className="text-xs text-purple-400/70 text-center font-[family-name:var(--font-display)]">
            <Zap size={10} className="inline mr-1" />
            AI 会引导你使用正在学习的生词进行对话
          </p>
        )}
      </header>

      {/* ── Voice Mode ── */}
      {mode === 'voice' && (
        <div className="flex-1 overflow-y-auto px-4 no-scrollbar">
          <VoiceMode />
        </div>
      )}

      {/* ── Text Mode ── */}
      {mode === 'text' && (
        <>
          {/* ── Topics ── */}
          <div className="px-4 py-2.5 flex gap-2 overflow-x-auto no-scrollbar">
            {TOPICS.map(t => (
              <button
                key={t}
                onClick={() => { setInput(t); textareaRef.current?.focus(); }}
                className="shrink-0 px-3.5 py-1.5 text-xs rounded-full border border-ink-700/60 text-ink-300
                           hover:border-brand-500/30 hover:text-brand-300 hover:bg-brand-500/5
                           transition-all duration-200 font-[family-name:var(--font-display)]"
              >
                {t}
              </button>
            ))}
          </div>

          {/* ── Guided Mode Word Panel ── */}
          {guidedMode && (
            <div className="px-4 mb-2">
              <button
                onClick={() => setShowWordPanel(!showWordPanel)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-ink-800/60 border border-ink-700/40 text-xs text-ink-300 hover:border-purple-500/20 transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <BookOpen size={14} className="text-brand-400" />
                  <span className="font-[family-name:var(--font-display)]">
                    学习队列 · {wordStats.total} 词
                  </span>
                  <span className="text-sage-400 text-xs">
                    掌握 {wordStats.mastered}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <ProgressBar value={masteryPct} size="sm" color="sage" className="w-16" />
                  {showWordPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>
              {showWordPanel && (
                <div className="mt-2 space-y-2 max-h-52 overflow-y-auto no-scrollbar animate-slide-down">
                  {activeWords.slice(0, 8).map((w, i) => {
                    const status = STATUS_LABELS[w.status];
                    return (
                      <div key={i} className="flex items-center justify-between bg-ink-800/80 rounded-xl px-3.5 py-2.5 border border-ink-700/40">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-ink-100 font-[family-name:var(--font-display)]">
                              {w.word}
                            </span>
                            <Badge color={CEFR_COLORS[w.cefr_level] || 'blue'}>{w.cefr_level}</Badge>
                          </div>
                          <p className="text-xs text-ink-500 mt-0.5 truncate">{w.translation}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <Badge color={status.color}>{status.label}</Badge>
                          <button
                            onClick={() => markProgress(w.word, 'mastered')}
                            className="p-1.5 rounded-lg text-ink-500 hover:text-sage-400 hover:bg-sage-500/10 transition-colors"
                            title="标记为已掌握"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {activeWords.length === 0 && (
                    <p className="text-xs text-ink-500 text-center py-4">所有单词已掌握！</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="mx-4 mb-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 text-xs text-red-300 animate-slide-down">
              {error}
            </div>
          )}

          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                <div className={msg.role === 'user' ? 'msg-user' : 'msg-bot'}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.role === 'bot' && msg.content && !sending && (
                    <button
                      onClick={() => speak(msg.content)}
                      className="mt-2.5 flex items-center gap-1 text-xs text-ink-500 hover:text-brand-400 transition-colors font-[family-name:var(--font-display)]"
                    >
                      <Volume2 size={12} /> 朗读
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start animate-fade-in">
                <div className="msg-bot flex items-center gap-2.5">
                  <Loader2 size={15} className="animate-spin text-brand-400" />
                  <span className="text-sm text-ink-400">Luna 正在输入...</span>
                </div>
              </div>
            )}
            {guidedMode && extractedWords.length > 0 && (
              <div className="mt-4 space-y-2 animate-slide-up">
                <p className="text-xs text-ink-500 flex items-center gap-1.5 font-[family-name:var(--font-display)]">
                  <Sparkles size={12} className="text-brand-400" />
                  本次对话提取的生词
                </p>
                {extractedWords.slice(-5).map((w, i) => (
                  <div key={i} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-ink-800/60 border border-ink-700/40">
                    <div>
                      <span className="text-sm font-medium text-ink-100">{w.word}</span>
                      <span className="text-xs text-ink-500 ml-2">{w.translation}</span>
                    </div>
                    <Badge color={CEFR_COLORS[w.cefr_level] || 'blue'}>{w.cefr_level}</Badge>
                  </div>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Input Bar ── */}
          <div className="fixed bottom-[4.5rem] left-0 right-0 max-w-lg mx-auto px-3 py-2.5 bg-ink-950/90 backdrop-blur-xl border-t border-ink-700/50 safe-bottom">
            <div className="flex items-end gap-2.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={guidedMode ? '试试用正在学的单词来造句...' : '输入英文或中文开始对话...'}
                rows={1}
                className="flex-1 bg-ink-800/90 border border-ink-700/50 rounded-2xl px-4 py-2.5
                           text-sm text-ink-100 placeholder-ink-500
                           focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/15
                           resize-none transition-all duration-200"
                style={{ maxHeight: '120px' }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || sending}
                className="shrink-0 w-10 h-10 rounded-2xl bg-brand-500 hover:bg-brand-400
                           disabled:opacity-30 disabled:cursor-not-allowed
                           flex items-center justify-center transition-all duration-200
                           active:scale-90"
              >
                {sending ? (
                  <Loader2 size={18} className="animate-spin text-ink-950" />
                ) : (
                  <Send size={18} className="text-ink-950" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
