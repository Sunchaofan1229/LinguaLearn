import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, ImageUp, Loader2, RefreshCw, Sparkles, CheckCircle2, Plus, Volume2, Edit2, Check, FileText } from 'lucide-react';
import Tesseract from 'tesseract.js';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';

interface WordCard {
  word: string;
  translation: string;
  phonetic: string;
  part_of_speech: string;
  cefr_level: string;
  example_sentence: string;
  example_translation: string;
  topic_tags: string[];
  encounter_count: number;
  status: string;
  due_for_review: boolean;
  category_reason: string;
}

interface OCRResult {
  known: WordCard[];
  recommend: WordCard[];
  too_hard: WordCard[];
  stats: { total: number; known_count: number; recommend_count: number; too_hard_count: number };
}

const CEFR_COLORS: Record<string, string> = {
  A1: 'bg-green-700/40 text-green-300 border-green-600',
  A2: 'bg-green-600/40 text-green-200 border-green-500',
  B1: 'bg-yellow-600/40 text-yellow-200 border-yellow-500',
  B2: 'bg-orange-600/40 text-orange-200 border-orange-500',
  C1: 'bg-red-600/40 text-red-200 border-red-500',
  C2: 'bg-red-700/40 text-red-300 border-red-600',
};

const BASE = '/api/v1';

export default function SnapPage() {
  const nav = useNavigate();
  const { token } = useAuth();

  // State
  const [mode, setMode] = useState<'scan' | 'text'>('scan');
  const [imageData, setImageData] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [result, setResult] = useState<OCRResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());
  const [addingWord, setAddingWord] = useState('');
  const [editingWord, setEditingWord] = useState<WordCard | null>(null);
  const [editForm, setEditForm] = useState<Partial<WordCard>>({});

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState('');

  // Start camera
  const startCam = useCallback(async () => {
    try {
      setCamError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCamReady(true);
      }
    } catch (e) {
      setCamError('无法打开摄像头。请检查权限或改用上传图片。');
    }
  }, []);

  // Stop camera
  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamReady(false);
  }, []);

  useEffect(() => { startCam(); return () => stopCam(); }, [startCam, stopCam]);

  // Capture photo
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setImageData(canvas.toDataURL('image/jpeg', 0.9));
    stopCam();
  };

  // Retake
  const retake = () => {
    setImageData(null); setOcrText(''); setEditedText(''); setResult(null); setError('');
    startCam();
  };

  // Handle file upload
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setImageData(reader.result as string); stopCam(); };
    reader.readAsDataURL(file);
  };

  // OCR with Tesseract
  const runOCR = async () => {
    if (!imageData) return;
    setIsProcessing(true); setProgress(0); setProgressLabel('正在加载识别引擎...');
    try {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
            setProgressLabel('识别中...');
          }
        },
      });
      const { data } = await worker.recognize(imageData);
      const text = data.text.trim().replace(/\s+/g, ' ').replace(/\n{2,}/g, '\n');
      setOcrText(text); setEditedText(text);
      await worker.terminate();
    } catch (e: any) {
      setError('OCR 识别失败：' + (e.message || '未知错误'));
    }
    setIsProcessing(false);
  };

  // Send to analysis
  const analyze = async () => {
    if (!token || !editedText.trim()) return;
    setAnalyzing(true); setError('');

    // Extract words from text
    const words = editedText.match(/[a-zA-Z]{2,}/g) || [];
    const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))];

    if (uniqueWords.length === 0) {
      setError('未检测到英文单词');
      setAnalyzing(false);
      return;
    }

    try {
      const res = await fetch(BASE + '/wordbank/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ words: uniqueWords.slice(0, 300) }),
      });
      if (!res.ok) throw new Error('分析失败');
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message || '分析失败');
    }
    setAnalyzing(false);
  };

  // Add word to bank
  const addToBank = async (card: WordCard) => {
    if (!token || addedWords.has(card.word)) return;
    setAddingWord(card.word);
    try {
      const res = await fetch(BASE + '/wordbank/add-to-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ words: [{ ...card, source: 'ocr' }] }),
      });
      if (res.ok) setAddedWords(prev => new Set([...prev, card.word]));
    } catch {}
    setAddingWord('');
  };

  // Bulk add
  const addAll = async (cards: WordCard[]) => {
    if (!token) return;
    for (const c of cards) {
      if (addedWords.has(c.word)) continue;
      try {
        const res = await fetch(BASE + '/wordbank/add-to-bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ words: [{ ...c, source: 'ocr' }] }),
        });
        if (res.ok) setAddedWords(prev => new Set([...prev, c.word]));
      } catch {}
    }
  };

  // Speak
  const speak = (word: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US'; u.rate = 0.8;
      window.speechSynthesis.speak(u);
    }
  };

  // Edit word card
  const startEdit = (card: WordCard) => {
    setEditingWord(card);
    setEditForm({ ...card });
  };

  const saveEdit = () => {
    if (!editingWord || !result) return;
    // Update in-place by replacing
    const update = (list: WordCard[]) => list.map(w => w.word === editingWord.word ? { ...w, ...editForm } as WordCard : w);
    setResult({
      ...result,
      known: update(result.known),
      recommend: update(result.recommend),
      too_hard: update(result.too_hard),
    });
    setEditingWord(null);
  };

  // Word card component
  const WordCardView = ({ card, showReason }: { card: WordCard; showReason?: boolean }) => {
    const isAdded = addedWords.has(card.word);
    const isAdding = addingWord === card.word;
    return (
      <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-800 border border-surface-700 group">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 mt-0.5 ${CEFR_COLORS[card.cefr_level] || 'bg-surface-700 text-surface-300'}`}>
          {card.cefr_level}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{card.word}</span>
            <span className="text-xs text-surface-400">{card.part_of_speech}</span>
            <button onClick={() => speak(card.word)} className="p-0.5 text-surface-500 hover:text-primary-400 transition-colors">
              <Volume2 size={13} />
            </button>
            <button onClick={() => startEdit(card)} className="p-0.5 text-surface-600 hover:text-yellow-400 transition-colors opacity-0 group-hover:opacity-100">
              <Edit2 size={11} />
            </button>
          </div>
          {card.phonetic && <p className="text-[11px] text-surface-500 mt-0.5">{card.phonetic}</p>}
          <p className="text-xs text-surface-400 mt-0.5">{card.translation}</p>
          <p className="text-xs text-surface-500 mt-1 italic leading-relaxed">{card.example_sentence}</p>
          {card.example_translation && (
            <p className="text-[11px] text-surface-600 mt-0.5">{card.example_translation}</p>
          )}
          {showReason && card.category_reason && (
            <p className="text-[10px] text-surface-500 mt-1">{card.category_reason}</p>
          )}
          {card.encounter_count > 0 && (
            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-primary-600/20 text-primary-300 text-[10px]">
              见过 {card.encounter_count} 次
            </span>
          )}
        </div>
        <button
          onClick={() => addToBank(card)}
          disabled={isAdded || !!isAdding}
          className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
            isAdded ? 'bg-green-600/20 text-green-400' : 'bg-surface-700 hover:bg-primary-600 text-surface-400 hover:text-white'
          }`}
        >
          {isAdded ? <CheckCircle2 size={14} /> : isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface-950 text-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface-950/90 backdrop-blur-sm border-b border-surface-800">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => nav('/')} className="p-1 -ml-1 text-surface-400 hover:text-white"><ArrowLeft size={20} /></button>
          <h1 className="font-semibold text-sm flex items-center gap-2">📸 场景录</h1>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => { setMode('scan'); setImageData(null); setResult(null); setError(''); if (!camReady) startCam(); }}
              className={`px-3 py-1 text-xs rounded-lg ${mode === 'scan' ? 'bg-primary-600 text-white' : 'text-surface-400 hover:text-white'}`}>
              <Camera size={12} className="inline mr-1" />拍照
            </button>
            <button onClick={() => setMode('text')}
              className={`px-3 py-1 text-xs rounded-lg ${mode === 'text' ? 'bg-primary-600 text-white' : 'text-surface-400 hover:text-white'}`}>
              <FileText size={12} className="inline mr-1" />文本
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-600/10 border border-red-700/30 text-red-400 text-xs">{error}</div>
        )}

        {/* --- Scan Mode --- */}
        {mode === 'scan' && (
          <>
            {/* Camera / Preview */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
              {!imageData ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  {!camReady && !camError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900 gap-3">
                      <Camera size={32} className="text-surface-500 animate-pulse" />
                      <p className="text-xs text-surface-500">正在启动摄像头...</p>
                    </div>
                  )}
                  {camError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900 gap-3 px-4">
                      <Camera size={32} className="text-red-400" />
                      <p className="text-xs text-surface-400 text-center">{camError}</p>
                      <button onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-xl bg-primary-600 text-xs font-medium">上传图片</button>
                    </div>
                  )}
                  {camReady && (
                    <button onClick={capturePhoto}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full border-4 border-white/80 bg-white/20 hover:bg-white/30 transition-all z-10" />
                  )}
                </>
              ) : (
                <>
                  <img src={imageData} alt="Captured" className="w-full h-full object-cover" />
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                      <Loader2 size={32} className="animate-spin text-primary-400" />
                      <p className="text-sm text-white">{progressLabel}</p>
                      <div className="w-48 h-1.5 rounded-full bg-surface-700 overflow-hidden">
                        <div className="h-full bg-primary-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Actions for scan mode */}
            {imageData && !isProcessing && !result && (
              <div className="flex gap-3">
                <button onClick={retake} className="flex-1 py-2.5 rounded-xl bg-surface-800 text-surface-300 text-sm font-medium flex items-center justify-center gap-2 hover:bg-surface-700">
                  <RefreshCw size={16} /> 重拍
                </button>
                <button onClick={runOCR} className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary-500">
                  <Sparkles size={16} /> 识别文字
                </button>
              </div>
            )}
          </>
        )}

        {/* --- Text Mode --- */}
        {mode === 'text' && !result && (
          <>
            <div className="flex gap-3">
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="flex-1 py-3 rounded-xl bg-surface-800 border border-surface-700 text-surface-300 text-sm flex items-center justify-center gap-2 hover:bg-surface-700">
                <ImageUp size={18} /> 选择图片
              </button>
            </div>
            {imageData && (
              <>
                <div className="rounded-xl overflow-hidden bg-black aspect-video">
                  <img src={imageData} alt="Uploaded" className="w-full h-full object-cover" />
                </div>
                {!isProcessing && !ocrText && (
                  <button onClick={runOCR}
                    className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary-500">
                    <Sparkles size={16} /> 识别文字
                  </button>
                )}
              </>
            )}
          </>
        )}

        {/* --- OCR Result Edit Area --- */}
        {ocrText && !result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-surface-400">识别结果（可编辑）</h3>
              <span className="text-[10px] text-surface-500">{editedText.length} 字符</span>
            </div>
            <textarea
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              className="w-full h-32 px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-sm text-white placeholder-surface-500 resize-none focus:outline-none focus:border-primary-500"
              placeholder="OCR 结果将显示在这里..."
            />
            <button onClick={analyze} disabled={analyzing || !editedText.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-600 to-purple-600 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:from-primary-500 hover:to-purple-500 disabled:opacity-50 transition-all">
              {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {analyzing ? 'AI 正在分级推荐...' : 'AI 智能分级推荐'}
            </button>
          </div>
        )}

        {/* --- Word Edit Modal --- */}
        {editingWord && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setEditingWord(null)}>
            <div className="bg-surface-900 w-full max-w-lg rounded-t-3xl p-6 space-y-4 max-h-[70vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">编辑单词</h3>
                <button onClick={saveEdit} className="p-2 rounded-lg bg-primary-600 text-white"><Check size={16} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-surface-500">单词</label>
                  <input value={editForm.word || ''} onChange={e => setEditForm({...editForm, word: e.target.value})}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-sm text-white" />
                </div>
                <div>
                  <label className="text-[10px] text-surface-500">翻译</label>
                  <input value={editForm.translation || ''} onChange={e => setEditForm({...editForm, translation: e.target.value})}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-sm text-white" />
                </div>
                <div>
                  <label className="text-[10px] text-surface-500">音标</label>
                  <input value={editForm.phonetic || ''} onChange={e => setEditForm({...editForm, phonetic: e.target.value})}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-sm text-white" />
                </div>
                <div>
                  <label className="text-[10px] text-surface-500">词性/CEFR</label>
                  <input value={editForm.part_of_speech || ''} onChange={e => setEditForm({...editForm, part_of_speech: e.target.value})}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-sm text-white" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- Results: Three Tiers --- */}
        {result && (
          <div className="space-y-4">
            {/* Summary Bar */}
            <div className="flex gap-2 text-xs">
              <span className="px-3 py-1.5 rounded-full bg-green-600/20 text-green-300">{result.stats.known_count} 已知</span>
              <span className="px-3 py-1.5 rounded-full bg-yellow-600/20 text-yellow-300">{result.stats.recommend_count} 推荐</span>
              <span className="px-3 py-1.5 rounded-full bg-red-600/20 text-red-300">{result.stats.too_hard_count} 太难</span>
            </div>

            {/* Recommend (most important — show first) */}
            {result.recommend.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-yellow-300 flex items-center gap-1.5">
                    <Sparkles size={14} /> 推荐学习 ({result.recommend.length})
                  </h3>
                  <button onClick={() => addAll(result.recommend)}
                    className="text-[11px] text-yellow-400 hover:text-yellow-300 font-medium">全部加入生词库</button>
                </div>
                <div className="space-y-2">{result.recommend.map(c => <WordCardView key={c.word} card={c} showReason />)}</div>
              </div>
            )}

            {/* Too hard */}
            {result.too_hard.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-300 mb-2 flex items-center gap-1.5">
                  🔺 暂时太难 ({result.too_hard.length})
                </h3>
                <div className="space-y-2">{result.too_hard.map(c => <WordCardView key={c.word} card={c} showReason />)}</div>
              </div>
            )}

            {/* Known */}
            {result.known.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-green-300 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> 已掌握 ({result.known.length})
                  </h3>
                  <button onClick={() => document.querySelector('[data-tier="known"]')?.classList.toggle('hidden')}
                    className="text-[11px] text-surface-500">收起</button>
                </div>
                <div data-tier="known" className="space-y-2">{result.known.map(c => <WordCardView key={c.word} card={c} showReason />)}</div>
              </div>
            )}

            {/* Back to scan */}
            <button onClick={() => { setResult(null); setOcrText(''); setImageData(null); setMode('scan'); startCam(); }}
              className="w-full py-2.5 rounded-xl border border-surface-700 text-surface-400 text-sm hover:text-white hover:border-surface-600 flex items-center justify-center gap-2">
              <Camera size={16} /> 再拍一张
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
