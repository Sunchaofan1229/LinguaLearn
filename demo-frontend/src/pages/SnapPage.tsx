import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, ImageUp, Loader2, RefreshCw, Sparkles, CheckCircle2, Plus, Volume2, Edit2, Check, FileText, Square, SquareCheck, MousePointer2, AlertTriangle } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { useAuth } from '../hooks/useAuth';
import { FirstUseTooltip, SNAP_PAGE_TIPS } from '../components/FirstUseTooltip';

interface OCRBBox {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
  selected: boolean;
}

interface WordCard {
  word: string; translation: string; phonetic: string; part_of_speech: string;
  cefr_level: string; example_sentence: string; example_translation: string;
  topic_tags: string[]; encounter_count: number; status: string;
  due_for_review: boolean; category_reason: string;
}

interface OCRResult {
  known: WordCard[]; recommend: WordCard[]; too_hard: WordCard[];
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

  const [mode, setMode] = useState<'scan' | 'text'>('scan');
  const [imageData, setImageData] = useState<string | null>(null);
  const [bboxes, setBBoxes] = useState<OCRBBox[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [result, setResult] = useState<OCRResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [streamProgress, setStreamProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());
  const [addingWord, setAddingWord] = useState('');
  const [editingWord, setEditingWord] = useState<WordCard | null>(null);
  const [editForm, setEditForm] = useState<Partial<WordCard>>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ocrRunningRef = useRef(false);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState('');
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 });

  // ── Camera ──
  const startCam = useCallback(async () => {
    try {
      setCamError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; setCamReady(true); }
    } catch { setCamError('Unable to open camera. Please use upload instead.'); }
  }, []);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null; setCamReady(false);
  }, []);

  useEffect(() => { startCam(); return () => stopCam(); }, []);

  // ── OCR ──
  const runOCR = async (imgSrc: string) => {
    if (ocrRunningRef.current || !imgSrc) return;
    ocrRunningRef.current = true;
    setIsProcessing(true); setProgress(0); setProgressLabel('Loading engine...');
    setBBoxes([]); setError('');

    try {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m: any) => {
          const s = (m.status || '').toLowerCase();
          if (s.includes('load') || s.includes('init')) {
            setProgress(Math.round((m.progress || 0) * 50));
            setProgressLabel('Loading engine...');
          } else if (s.includes('recogn')) {
            setProgress(50 + Math.round((m.progress || 0) * 50));
            setProgressLabel('Recognizing...');
          }
        },
      });

      // Set PSM to auto-detect layout (enables word-level bbox)
      await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });

      setProgressLabel('Recognizing...');
      const { data } = await worker.recognize(imgSrc, {}, { tsv: true, blocks: true, text: true });

      const wordBoxes: OCRBBox[] = [];
      const dedupe = new Set<string>();

      const addWord = (text: string, bbox: { x0: number; y0: number; x1: number; y1: number }, confidence: number) => {
        const clean = text.trim().replace(/[^a-zA-Z]/g, '');
        if (clean.length < 2 || clean.length > 30) return;
        const key = `${clean}|${Math.round(bbox.x0)}|${Math.round(bbox.y0)}`;
        if (dedupe.has(key)) return;
        dedupe.add(key);
        wordBoxes.push({ text: clean, bbox, confidence, selected: confidence > 50 });
      };

      // Strategy 1: data.words (direct word-level access, Tesseract v5+)
      if (data.words && data.words.length > 0) {
        for (const w of data.words) {
          addWord(w.text, w.bbox, w.confidence);
        }
      }

      // Strategy 2: data.lines → words (Tesseract v5 typed API)
      if (wordBoxes.length === 0 && data.lines && data.lines.length > 0) {
        for (const line of data.lines) {
          if (line.words) {
            for (const w of line.words) {
              addWord(w.text, w.bbox, w.confidence);
            }
          }
        }
      }

      // Strategy 3: data.blocks → paragraphs → lines → words
      if (wordBoxes.length === 0 && data.blocks && data.blocks.length > 0) {
        for (const block of data.blocks) {
          const paras = block.paragraphs || [];
          for (const para of paras) {
            const lines = para.lines || [];
            for (const line of lines) {
              const words = line.words || [];
              for (const w of words) {
                addWord(w.text, w.bbox, w.confidence);
              }
            }
          }
        }
      }

      // Strategy 4: Parse TSV (most reliable bbox source, level 5 = word)
      if (wordBoxes.length === 0 && (data as any).tsv) {
        const tsvLines = ((data as any).tsv as string).split('\n');
        for (const tsvLine of tsvLines) {
          if (!tsvLine.trim() || tsvLine.startsWith('level')) continue;
          const cols = tsvLine.split('\t');
          if (cols.length < 12) continue;
          const level = parseInt(cols[0]);
          if (level !== 5) continue;
          const text = cols[11].trim().replace(/[^a-zA-Z0-9]/g, '');
          if (text.length < 2 || text.length > 30) continue;
          const left = parseInt(cols[6]), top = parseInt(cols[7]);
          const width = parseInt(cols[8]), height = parseInt(cols[9]);
          const conf = parseInt(cols[10]);
          addWord(text, { x0: left, y0: top, x1: left + width, y1: top + height }, conf);
        }
      }

      if (wordBoxes.length === 0) {
        if (data.text.trim()) {
          setError(`OCR found text but no word positions.\nText: "${data.text.trim().slice(0, 100)}..."\n\nPlease try a clearer photo with larger, more defined text.`);
        } else {
          setError('No English text detected. Please ensure the photo shows clear English words.');
        }
      } else {
        console.log(`Extracted ${wordBoxes.length} unique word bboxes`);
      }

      setBBoxes(wordBoxes);
      await worker.terminate();
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.includes('Network') || msg.includes('fetch') || msg.includes('timeout')) {
        setError('Engine download failed. Tesseract WASM is large (~6MB). Please check your network and try again.');
      } else {
        setError('OCR failed: ' + msg.slice(0, 100));
      }
    }
    setIsProcessing(false);
    ocrRunningRef.current = false;
  };

  // ── Photo capture → auto OCR ──
  const capturePhoto = () => {
    const video = videoRef.current, c = canvasRef.current;
    if (!video || !c) return;
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg', 0.9);
    setImageData(dataUrl);
    stopCam();
    setTimeout(() => runOCR(dataUrl), 400);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result as string;
      setImageData(dataUrl); stopCam();
      setTimeout(() => runOCR(dataUrl), 400);
    };
    r.readAsDataURL(file);
  };

  const retake = () => {
    setImageData(null); setBBoxes([]); setResult(null); setError(''); ocrRunningRef.current = false;
    startCam();
  };

  // ── Overlay ──
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas || bboxes.length === 0 || !imgNaturalSize.w) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement?.clientWidth || canvas.clientWidth;
    const ratio = imgNaturalSize.h / imgNaturalSize.w || 0.75;
    const h = w * ratio;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const sx = w / imgNaturalSize.w;
    const sy = h / imgNaturalSize.h;

    for (const b of bboxes) {
      const x = b.bbox.x0 * sx, y = b.bbox.y0 * sy;
      const bw = (b.bbox.x1 - b.bbox.x0) * sx, bh = (b.bbox.y1 - b.bbox.y0) * sy;

      ctx.fillStyle = b.selected ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = b.selected ? '#3b82f6' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = b.confidence > 80 ? '#4ade80' : b.confidence > 60 ? '#fbbf24' : '#f87171';
      ctx.fillRect(x, y - 2, bw, 2);
    }
  }, [bboxes, imgNaturalSize]);

  useEffect(() => { if (bboxes.length > 0) drawOverlay(); }, [bboxes, drawOverlay]);

  useEffect(() => {
    if (imageData) {
      const img = new Image();
      img.onload = () => setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = imageData;
    }
  }, [imageData]);

  useEffect(() => {
    const onResize = () => { if (bboxes.length > 0) drawOverlay(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bboxes, drawOverlay]);

  // ── Click ──
  const handleOverlayClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (bboxes.length === 0) return;
    const canvas = overlayRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const sx = canvas.clientWidth / imgNaturalSize.w;
    const sy = canvas.clientHeight / imgNaturalSize.h;
    const idx = bboxes.findIndex(b => {
      const bx = b.bbox.x0 * sx, by = b.bbox.y0 * sy;
      return x >= bx && x <= bx + (b.bbox.x1 - b.bbox.x0) * sx && y >= by && y <= by + (b.bbox.y1 - b.bbox.y0) * sy;
    });
    if (idx >= 0) setBBoxes(prev => prev.map((b, i) => i === idx ? { ...b, selected: !b.selected } : b));
  };

  const selectedCount = bboxes.filter(b => b.selected).length;
  const totalBBoxes = bboxes.length;

  // ── Selection ──
  const toggleAll = () => {
    const allSel = bboxes.every(b => b.selected);
    setBBoxes(prev => prev.map(b => ({ ...b, selected: !allSel })));
  };
  const clearSel = () => setBBoxes(prev => prev.map(b => ({ ...b, selected: false })));

  // ── SSE Analysis ──
  const analyze = async () => {
    if (!token) return;
    const words = [...new Set(bboxes.filter(b => b.selected).map(b => b.text.toLowerCase()))];
    if (words.length === 0) { setError('Please select at least one word.'); return; }
    setAnalyzing(true); setError(''); setResult(null);
    setStreamProgress({ done: 0, total: Math.ceil(words.length / 50) });
    try {
      const resp = await fetch(BASE + '/wordbank/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ words: words.slice(0, 300) }),
      });
      if (!resp.ok) throw new Error('Analysis request failed');
      const reader = resp.body?.getReader();
      if (!reader) throw new Error('Streaming not supported');
      const decoder = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'start') setStreamProgress({ done: 0, total: evt.chunks });
            else if (evt.type === 'words') {
              setResult(prev => {
                const b = prev || { known: [], recommend: [], too_hard: [], stats: { total: 0, known_count: 0, recommend_count: 0, too_hard_count: 0 } };
                return { known: [...b.known, ...(evt.known || [])], recommend: [...b.recommend, ...(evt.recommend || [])], too_hard: [...b.too_hard, ...(evt.too_hard || [])], stats: { ...b.stats } };
              });
              if (evt.progress) setStreamProgress({ done: evt.progress.done, total: evt.progress.total });
            } else if (evt.type === 'done') {
              setResult({ known: evt.known || [], recommend: evt.recommend || [], too_hard: evt.too_hard || [], stats: evt.stats || { total: 0, known_count: 0, recommend_count: 0, too_hard_count: 0 } });
            }
          } catch {}
        }
      }
    } catch (e: any) { setError(e.message || 'Analysis failed'); }
    setAnalyzing(false);
  };

  // ── Bank ──
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

  const speak = (word: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US'; u.rate = 0.8;
      window.speechSynthesis.speak(u);
    }
  };

  const startEdit = (card: WordCard) => { setEditingWord(card); setEditForm({ ...card }); };
  const saveEdit = () => {
    if (!editingWord || !result) return;
    const upd = (list: WordCard[]) => list.map(w => w.word === editingWord.word ? { ...w, ...editForm } as WordCard : w);
    setResult({ ...result, known: upd(result.known), recommend: upd(result.recommend), too_hard: upd(result.too_hard) });
    setEditingWord(null);
  };

  const WordCardView = ({ card, showReason }: { card: WordCard; showReason?: boolean }) => (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-800 border border-surface-700 group">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 mt-0.5 ${CEFR_COLORS[card.cefr_level] || 'bg-surface-700 text-surface-300'}`}>{card.cefr_level}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{card.word}</span>
          <span className="text-xs text-surface-400">{card.part_of_speech}</span>
          <button onClick={() => speak(card.word)} className="p-0.5 text-surface-500 hover:text-primary-400"><Volume2 size={13} /></button>
          <button onClick={() => startEdit(card)} className="p-0.5 text-surface-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100"><Edit2 size={11} /></button>
        </div>
        {card.phonetic && <p className="text-[11px] text-surface-500 mt-0.5">{card.phonetic}</p>}
        <p className="text-xs text-surface-400 mt-0.5">{card.translation}</p>
        <p className="text-xs text-surface-500 mt-1 italic leading-relaxed">{card.example_sentence}</p>
        {card.example_translation && <p className="text-[11px] text-surface-600 mt-0.5">{card.example_translation}</p>}
        {showReason && card.category_reason && <p className="text-[10px] text-surface-500 mt-1">{card.category_reason}</p>}
        {card.encounter_count > 0 && <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-primary-600/20 text-primary-300 text-[10px]">Seen {card.encounter_count}x</span>}
      </div>
      <button onClick={() => addToBank(card)} disabled={addedWords.has(card.word) || addingWord === card.word}
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${addedWords.has(card.word) ? 'bg-green-600/20 text-green-400' : 'bg-surface-700 hover:bg-primary-600 text-surface-400 hover:text-white'}`}>
        {addedWords.has(card.word) ? <CheckCircle2 size={14} /> : addingWord === card.word ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
      </button>
    </div>
  );

  return (
    <FirstUseTooltip storageKey="snap" steps={SNAP_PAGE_TIPS}>
    <div className="min-h-screen bg-surface-950 text-white pb-24">
      <header className="sticky top-0 z-30 bg-surface-950/90 backdrop-blur-sm border-b border-surface-800">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => nav('/')} className="p-1 -ml-1 text-surface-400 hover:text-white"><ArrowLeft size={20} /></button>
          <h1 className="font-semibold text-sm">Scene Snap</h1>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => { setMode('scan'); setImageData(null); setBBoxes([]); setResult(null); setError(''); ocrRunningRef.current = false; if (!camReady) startCam(); }}
              className={`px-3 py-1 text-xs rounded-lg ${mode === 'scan' ? 'bg-primary-600 text-white' : 'text-surface-400 hover:text-white'}`}>Camera</button>
            <button onClick={() => setMode('text')}
              className={`px-3 py-1 text-xs rounded-lg ${mode === 'text' ? 'bg-primary-600 text-white' : 'text-surface-400 hover:text-white'}`}>Upload</button>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-600/10 border border-red-700/30 text-red-400 text-xs whitespace-pre-wrap flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        {/* Camera / Preview */}
        <div ref={imageWrapRef} className="relative rounded-2xl overflow-hidden bg-black">
          {!imageData ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full object-cover" style={{ maxHeight: '70vh' }} />
              <canvas ref={canvasRef} className="hidden" />
              {!camReady && !camError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900 gap-3">
                  <Camera size={32} className="text-surface-500 animate-pulse" /><p className="text-xs text-surface-500">Starting camera...</p>
                </div>
              )}
              {camError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900 gap-3 px-4">
                  <Camera size={32} className="text-red-400" /><p className="text-xs text-surface-400 text-center">{camError}</p>
                  <button onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-xl bg-primary-600 text-xs font-medium">Upload image</button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
                </div>
              )}
              {camReady && (
                <button onClick={capturePhoto}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border-[5px] border-white/90 bg-white/25 hover:bg-white/40 active:scale-95 transition-all z-10 shadow-lg shadow-black/30" />
              )}
            </>
          ) : (
            <div className="relative">
              <img ref={imageRef} src={imageData} alt="Captured" className="w-full block" onLoad={() => setTimeout(drawOverlay, 100)} />
              {isProcessing && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 px-4">
                  <Loader2 size={36} className="animate-spin text-primary-400" />
                  <p className="text-sm text-white font-medium">{progressLabel}</p>
                  <div className="w-56 h-2 rounded-full bg-surface-700 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary-500 to-purple-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-[11px] text-surface-400">{progress}%</p>
                </div>
              )}
              {totalBBoxes > 0 && !isProcessing && (
                <canvas ref={overlayRef} className="absolute top-0 left-0 cursor-crosshair" onClick={handleOverlayClick} />
              )}
              {totalBBoxes > 0 && !result && !isProcessing && (
                <div className="absolute top-2 right-2 bg-surface-950/85 backdrop-blur rounded-lg px-2.5 py-1.5 text-[10px] text-surface-300 flex items-center gap-1.5">
                  <MousePointer2 size={10} />Click boxes to select
                </div>
              )}
              {!isProcessing && (
                <button onClick={retake} className="absolute top-2 left-2 w-8 h-8 rounded-full bg-surface-950/70 backdrop-blur flex items-center justify-center text-surface-300 hover:text-white">
                  <RefreshCw size={15} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Text mode upload */}
        {mode === 'text' && !imageData && (
          <div className="flex gap-3">
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="flex-1 py-4 rounded-xl bg-surface-800 border border-dashed border-surface-600 text-surface-400 text-sm flex items-center justify-center gap-2 hover:border-primary-500 hover:text-primary-400">
              <ImageUp size={20} /> Choose image</button>
          </div>
        )}

        {/* BBox toolbar */}
        {totalBBoxes > 0 && !result && !isProcessing && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-surface-400">
              <span>{totalBBoxes} words detected</span>
              <span className="text-primary-400 font-medium">{selectedCount} selected</span>
              <div className="flex-1" />
              <button onClick={toggleAll} className="px-2 py-1 rounded bg-surface-800 hover:bg-surface-700 text-[11px] flex items-center gap-1">
                {bboxes.every(b => b.selected) ? <Square size={12} /> : <SquareCheck size={12} />}
                {bboxes.every(b => b.selected) ? 'Deselect all' : 'Select all'}
              </button>
              <button onClick={clearSel} className="px-2 py-1 rounded bg-surface-800 hover:bg-surface-700 text-[11px]">Clear</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {bboxes.filter(b => b.selected).map((b, i) => (
                <span key={`${b.text}-${i}`} onClick={() => setBBoxes(p => p.map(bx => bx.text === b.text && bx.bbox.x0 === b.bbox.x0 ? { ...bx, selected: false } : bx))}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-600/20 text-primary-300 text-[11px] cursor-pointer hover:bg-red-600/20 hover:text-red-300 transition-colors">
                  {b.text} <span className="text-[9px] opacity-60">x</span>
                </span>
              ))}
            </div>
            <button onClick={analyze} disabled={analyzing || selectedCount === 0}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-600 to-purple-600 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:from-primary-500 hover:to-purple-500 disabled:opacity-50 transition-all">
              {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {analyzing ? (streamProgress.total > 0 ? `AI analyzing... ${streamProgress.done}/${streamProgress.total}` : 'AI analyzing...') : `AI Smart Classification (${selectedCount} words)`}
            </button>
            {analyzing && streamProgress.total > 0 && (
              <div className="w-full h-1 rounded-full bg-surface-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary-500 to-purple-500 transition-all duration-500" style={{ width: `${(streamProgress.done / streamProgress.total) * 100}%` }} />
              </div>
            )}
          </div>
        )}

        {/* Edit Modal */}
        {editingWord && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setEditingWord(null)}>
            <div className="bg-surface-900 w-full max-w-lg rounded-t-3xl p-6 space-y-4 max-h-[70vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between"><h3 className="font-semibold">Edit Word</h3>
                <button onClick={saveEdit} className="p-2 rounded-lg bg-primary-600 text-white"><Check size={16} /></button></div>
              <div className="grid grid-cols-2 gap-3">
                {(['word', 'translation', 'phonetic', 'part_of_speech'] as const).map(f => (
                  <div key={f}><label className="text-[10px] text-surface-500 capitalize">{f.replace('_', ' ')}</label>
                    <input value={editForm[f] || ''} onChange={e => setEditForm({ ...editForm, [f]: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-sm text-white" /></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            <div className="flex gap-2 text-xs">
              <span className="px-3 py-1.5 rounded-full bg-green-600/20 text-green-300">{result.stats.known_count} Known</span>
              <span className="px-3 py-1.5 rounded-full bg-yellow-600/20 text-yellow-300">{result.stats.recommend_count} Recommended</span>
              <span className="px-3 py-1.5 rounded-full bg-red-600/20 text-red-300">{result.stats.too_hard_count} Too Hard</span>
            </div>
            {result.recommend.length > 0 && (
              <div><div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-yellow-300"><Sparkles size={14} className="inline mr-1" />Recommended ({result.recommend.length})</h3>
                <button onClick={() => addAll(result.recommend)} className="text-[11px] text-yellow-400 hover:text-yellow-300">Add all</button></div>
                <div className="space-y-2">{result.recommend.map(c => <WordCardView key={c.word} card={c} showReason />)}</div></div>)}
            {result.too_hard.length > 0 && (
              <div><h3 className="text-sm font-semibold text-red-300 mb-2">Too Hard ({result.too_hard.length})</h3>
                <div className="space-y-2">{result.too_hard.map(c => <WordCardView key={c.word} card={c} showReason />)}</div></div>)}
            {result.known.length > 0 && (
              <div><div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-green-300"><CheckCircle2 size={14} className="inline mr-1" />Known ({result.known.length})</h3>
                <button onClick={() => document.querySelector('[data-tier="known"]')?.classList.toggle('hidden')} className="text-[11px] text-surface-500">Hide</button></div>
                <div data-tier="known" className="space-y-2">{result.known.map(c => <WordCardView key={c.word} card={c} showReason />)}</div></div>)}
            <button onClick={() => { setResult(null); setBBoxes([]); setImageData(null); setMode('scan'); ocrRunningRef.current = false; startCam(); }}
              className="w-full py-2.5 rounded-xl border border-surface-700 text-surface-400 text-sm hover:text-white hover:border-surface-600 flex items-center justify-center gap-2">
              <Camera size={16} /> Take another</button>
          </div>
        )}
      </div>
    </div>
    </FirstUseTooltip>
  );
}
