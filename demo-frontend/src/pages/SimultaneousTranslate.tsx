import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { MicOff, ArrowLeftRight, Radio, Signal, Copy, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import MicPermissionGate from '../components/MicPermissionGate';
import { useMicPermission } from '../hooks/useMicPermission';
import { FirstUseTooltip, SIMUL_PAGE_TIPS } from '../components/FirstUseTooltip';

const SILENCE_MS = 1000;
const SAMPLE_RATE = 16000;

export default function SimultaneousTranslate() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { getStream } = useMicPermission();

  const [streaming, setStreaming] = useState(false);
  const [direction, setDirection] = useState<'zh2en' | 'en2zh'>('zh2en');
  const [error, setError] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [liveInput, setLiveInput] = useState('');
  const [translating, setTranslating] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [copied, setCopied] = useState(false);

  // Use refs for high-frequency deltas to avoid render storms
  const streamingTransRef = useRef('');
  const rafIdRef = useRef<number>(0);
  const [streamingTrans, setStreamingTrans] = useState(''); // only for rendering

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const origContainerRef = useRef<HTMLDivElement>(null);
  const transContainerRef = useRef<HTMLDivElement>(null);
  const l0RecRef = useRef<any>(null);
  const l0AccumRef = useRef('');
  const l0TimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  // RAF-based rendering for streaming translation (avoids setState storms)
  const flushStreamingRef = useCallback(() => {
    setStreamingTrans(streamingTransRef.current);
    if (origContainerRef.current) {
      origContainerRef.current.scrollTop = origContainerRef.current.scrollHeight;
    }
    if (transContainerRef.current) {
      transContainerRef.current.scrollTop = transContainerRef.current.scrollHeight;
    }
  }, []);

  const scheduleRender = useCallback(() => {
    if (rafIdRef.current) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = 0;
      flushStreamingRef();
    });
  }, [flushStreamingRef]);

  const connectWS = useCallback(() => {
    if (!token) return null;
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      const ws = new WebSocket(`${wsProto}//42.193.154.117/api/v1/ws/translate`);
      
      ws.onopen = () => {
        console.log('[Simul] WS connected');
        ws.send(JSON.stringify({ type: 'config', lang: direction === 'zh2en' ? 'zh' : 'en' }));
      };

      ws.onclose = (ev) => {
        console.log('[Simul] WS closed:', ev.code, ev.reason);
        if (streamRef.current) {
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = window.setTimeout(() => {
            wsRef.current = connectWS();
          }, 1500);
        }
      };

      ws.onerror = (ev) => {
        console.error('[Simul] WS error:', ev);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === 'level') {
            setAudioLevel(msg.level);
          } else if (msg.type === 'translation_start') {
            // Show original immediately
            setTranslating(true);
            streamingTransRef.current = '';
            setStreamingTrans('');
            setOriginalText(prev => (prev ? prev + '\n' : '') + msg.original);
            scheduleRender();
          } else if (msg.type === 'translation_delta') {
            // Accumulate in ref, render via RAF
            streamingTransRef.current += msg.delta;
            scheduleRender();
          } else if (msg.type === 'translation') {
            // Batch format (full translation at once)
            setOriginalText(prev => (prev ? prev + '\n' : '') + msg.original);
            setTranslatedText(prev => (prev ? prev + '\n' : '') + msg.text);
            setTranslating(false);
            scheduleRender();
          } else if (msg.type === 'translation_start') {
            // Streaming format — show original immediately
            setTranslating(true);
            streamingTransRef.current = '';
            setStreamingTrans('');
            setOriginalText(prev => (prev ? prev + '\n' : '') + msg.original);
            scheduleRender();
          } else if (msg.type === 'translation_delta') {
            // Streaming format — accumulate deltas
            streamingTransRef.current += msg.delta;
            scheduleRender();
          } else if (msg.type === 'translation_end') {
            // Streaming format — finalize
            const final = streamingTransRef.current;
            streamingTransRef.current = '';
            setStreamingTrans('');
            setTranslatedText(prev => (prev ? prev + '\n' : '') + final);
            setTranslating(false);
            scheduleRender();
          }
        } catch (err) {
          console.error('[Simul] Parse error:', err);
        }
      };

      return ws;
    } catch (err) {
      console.error('[Simul] WS connect error:', err);
      return null;
    }
  }, [token, direction, scheduleRender]);

  const setupAudioPipeline = useCallback(() => {
    const stream = getStream();
    if (!stream) return false;
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    sourceRef.current = src;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 80; hp.Q.value = 0.707;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -30; comp.knee.value = 20; comp.ratio.value = 8;
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = proc;
    src.connect(hp); hp.connect(comp); comp.connect(proc); proc.connect(ctx.destination);
    proc.onaudioprocess = (e) => {
      if (!streamRef.current) return;
      const input = e.inputBuffer.getChannelData(0);
      let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      setAudioLevel(Math.min(100, Math.sqrt(sum / input.length) * 500));
    };
    return true;
  }, [getStream]);

  const startL0 = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('浏览器不支持语音识别，请使用 Chrome');
      return;
    }
    if (!streamRef.current) return;

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = direction === 'zh2en' ? 'zh-CN' : 'en-US';
    r.maxAlternatives = 1;
    l0RecRef.current = r;

    r.onstart = () => console.log('[Simul] STT started');
    r.onerror = (event: any) => console.error('[Simul] STT error:', event.error, event.message);
    r.onend = () => {
      console.log('[Simul] STT ended');
      if (streamRef.current) {
        setTimeout(() => {
          try { r.start(); } catch (e) { console.error('[Simul] STT restart error:', e); }
        }, 300);
      }
    };

    r.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        interim += event.results[i][0].transcript;
      }
      setLiveInput(interim);
      l0AccumRef.current = interim;

      if (l0TimerRef.current) clearTimeout(l0TimerRef.current);
      l0TimerRef.current = window.setTimeout(() => {
        const text = l0AccumRef.current.trim();
        if (text && streamRef.current && text.length > 1) {
          console.log('[Simul] Sending text:', text);
          setLiveInput('');
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'text', text, direction }));
          } else {
            console.warn('[Simul] WS not open, cannot send');
          }
          l0AccumRef.current = '';
        }
      }, SILENCE_MS);
    };

    try { r.start(); } catch (e) { console.error('[Simul] STT start error:', e); }
  }, [direction]);

  const startStreaming = useCallback(() => {
    if (!setupAudioPipeline()) { setError('麦克风未就绪'); return; }
    streamRef.current = true;
    setStreaming(true);
    setOriginalText('');
    setTranslatedText('');
    setLiveInput('');
    setStreamingTrans('');
    streamingTransRef.current = '';
    setError('');
    wsRef.current = connectWS();
    startL0();
  }, [setupAudioPipeline, connectWS, startL0]);

  const stopStreaming = useCallback(() => {
    streamRef.current = false;
    setStreaming(false);
    setLiveInput('');
    setTranslating(false);
    streamingTransRef.current = '';
    setStreamingTrans('');
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (l0TimerRef.current) clearTimeout(l0TimerRef.current);
    try { l0RecRef.current?.stop(); } catch { }
    try { wsRef.current?.close(); } catch { }
    wsRef.current = null;
    try { processorRef.current?.disconnect(); } catch { }
    try { sourceRef.current?.disconnect(); } catch { }
    try { audioCtxRef.current?.close(); } catch { }
  }, []);

  const flipDirection = useCallback(() => {
    const was = streamRef.current;
    if (was) stopStreaming();
    setDirection(prev => prev === 'zh2en' ? 'en2zh' : 'zh2en');
    setTimeout(() => { if (was) startStreaming(); }, 300);
  }, [stopStreaming, startStreaming]);

  const copyAll = () => {
    const label1 = direction === 'zh2en' ? '中文原文' : 'English Original';
    const label2 = direction === 'zh2en' ? 'English Translation' : '中文翻译';
    navigator.clipboard.writeText(`${label1}:\n${originalText}\n\n${label2}:\n${translatedText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasContent = originalText || translatedText;
  const displayTranslation = translatedText + (streamingTrans ? (translatedText ? '\n' : '') + streamingTrans : '');

  return (
    <MicPermissionGate>
      <FirstUseTooltip storageKey="simul" steps={SIMUL_PAGE_TIPS}>
      <div className="flex flex-col h-[100dvh]">
        <div className="px-4 py-3 border-b border-surface-700 bg-surface-900/95 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} className="text-surface-400" /></button>
              <div>
                <h1 className="text-base font-semibold flex items-center gap-2"><Radio size={18} className="text-red-400" />同声传译</h1>
                <p className="text-xs text-surface-400">{streaming ? '🟢 实时' : '准备就绪'} · {direction === 'zh2en' ? '中→英' : '英→中'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasContent && (
                <button onClick={copyAll} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-xs">
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-surface-400" />}
                  {copied ? '已复制' : '复制'}
                </button>
              )}
              <button onClick={flipDirection} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-xs"><ArrowLeftRight size={14} />切换</button>
            </div>
          </div>
        </div>

        {error && <div className="mx-4 mt-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 text-xs text-red-300">{error}</div>}

        {streaming && (
          <div className="mx-4 mt-2">
            <div className="flex items-center gap-2 text-xs text-surface-500 mb-1"><Signal size={12} className="text-green-400" /><span>音频</span><span className="ml-auto">{audioLevel}%</span></div>
            <div className="w-full h-1 bg-surface-700 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-100" style={{ width: `${audioLevel}%`, background: audioLevel > 70 ? 'linear-gradient(90deg, #22c55e, #ef4444)' : audioLevel > 30 ? 'linear-gradient(90deg, #22c55e, #eab308)' : '#22c55e' }} /></div>
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden px-4 py-3 gap-3">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-[10px] uppercase tracking-wide text-blue-400 font-medium">
                {direction === 'zh2en' ? '中文原文' : 'English Original'}
              </span>
              {streaming && liveInput && <span className="text-[10px] text-surface-500 ml-auto">输入中...</span>}
            </div>
            <div ref={origContainerRef} className="flex-1 overflow-y-auto bg-surface-800 rounded-xl border border-surface-700 p-3 text-sm text-surface-200 whitespace-pre-wrap leading-relaxed">
              {originalText || (streaming ? (liveInput || '等待语音...') : '点击下方按钮开始')}
              {originalText && liveInput && <span className="text-primary-400"> {liveInput}</span>}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[10px] uppercase tracking-wide text-emerald-400 font-medium">
                {direction === 'zh2en' ? 'English Translation' : '中文翻译'}
              </span>
              {translating && (
                <span className="text-[10px] text-emerald-500 ml-auto">
                  {streamingTrans ? '翻译中...' : '等待...'}
                </span>
              )}
            </div>
            <div ref={transContainerRef} className="flex-1 overflow-y-auto bg-emerald-600/5 rounded-xl border border-emerald-500/20 p-3 text-sm text-white whitespace-pre-wrap leading-relaxed">
              {displayTranslation || <span className="text-surface-500 italic">{streaming ? '翻译将逐字显示...' : '点击下方按钮开始'}</span>}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-40 pb-6 pointer-events-none">
          <div className="max-w-lg mx-auto px-4 pointer-events-auto">
            <div className="flex flex-col items-center gap-2">
              {!streaming ? (
                <>
                  <button onClick={startStreaming} className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all hover:scale-105 active:scale-95"><Radio size={36} className="text-white" /></button>
                  <p className="text-sm font-medium text-red-400">开始同声传译</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><span className="text-sm text-surface-300">🎙️ {direction === 'zh2en' ? '中→英' : '英→中'}</span></div>
                  <button onClick={stopStreaming} className="w-20 h-20 rounded-full bg-surface-700 hover:bg-surface-600 border-2 border-red-500/50 flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"><MicOff size={36} className="text-red-400" /></button>
                  <p className="text-sm font-medium text-surface-400">停止</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      </FirstUseTooltip>
    </MicPermissionGate>
  );
}
