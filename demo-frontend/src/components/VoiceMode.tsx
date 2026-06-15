import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Mic, Volume2, VolumeX, Phone, PhoneOff, Loader2, Sparkles, Settings, Users, Monitor, MonitorSmartphone } from 'lucide-react';
import MicPermissionGate from './MicPermissionGate';
import DigitalHuman, { CHARACTERS, type CharacterConfig, type DigitalHumanHandle } from './DigitalHuman';
import Live2DCharacter, { type Live2DHandle } from './Live2DCharacter';

const BASE = '/api/v1';
const SILENCE_TIMEOUT = 2000;

interface Message { role: 'user' | 'bot'; content: string; }

interface VoiceOption { name: string; lang: string; label: string; gender: 'male' | 'female'; }

const VOICE_OPTIONS: VoiceOption[] = [
  { name: 'Google US English', lang: 'en-US', label: '🗣️ 年轻女声', gender: 'female' },
  { name: 'Google UK English Female', lang: 'en-GB', label: '🗣️ 英伦女声', gender: 'female' },
  { name: 'Google UK English Male', lang: 'en-GB', label: '🗣️ 成熟男声', gender: 'male' },
  { name: 'Microsoft Xiaoxiao', lang: 'zh-CN', label: '🗣️ 晓晓', gender: 'female' },
  { name: 'Microsoft Yunxi', lang: 'zh-CN', label: '🗣️ 云希', gender: 'male' },
  { name: 'Google 普通话', lang: 'zh-CN', label: '🗣️ 普通话女声', gender: 'female' },
];

export default function VoiceMode() {
  const { token, user } = useAuth();
  const humanRef = useRef<DigitalHumanHandle>(null);
  const live2dRef = useRef<Live2DHandle>(null);
  const [displayMode, setDisplayMode] = useState<'3d' | '2d'>('2d'); // Default 2D (Live2D)

  const [messages, setMessages] = useState<Message[]>([]);
  const [inCall, setInCall] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const [micReady, setMicReady] = useState(false);
  const [micPrompting, setMicPrompting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(0);
  const [selectedChar, setSelectedChar] = useState<CharacterConfig>(CHARACTERS[0]);
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'talking' | 'processing'>('idle');

  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const transcriptAccumRef = useRef('');
  const callActiveRef = useRef(false);
  const processingRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const startListeningRef = useRef<(() => void) | null>(null);
  const charRef = useRef(selectedChar);
  charRef.current = selectedChar;

  // Sync talking/listening to DigitalHuman
  useEffect(() => { humanRef.current?.setTalking(aiSpeaking); }, [aiSpeaking]);
  useEffect(() => { humanRef.current?.setListening(listening); }, [listening]);

  // Init
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const savedV = localStorage.getItem('ll_voice');
    if (savedV) { const idx = parseInt(savedV); if (!isNaN(idx) && idx < VOICE_OPTIONS.length) setSelectedVoice(idx); }
    const savedC = localStorage.getItem('ll_character');
    if (savedC) { const c = CHARACTERS.find(ch => ch.id === savedC); if (c) { setSelectedChar(c); setSelectedVoice(c.voiceIndex); } }
  }, []);

  useEffect(() => {
    return () => {
      callActiveRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try { recognitionRef.current?.abort(); } catch {}
      window.speechSynthesis?.cancel();
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, aiSpeaking, transcript]);

  // ── TTS (浏览器原生) ──
  const getVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;
    const target = VOICE_OPTIONS[selectedVoice];
    let match = voices.find(v => v.name === target.name);
    if (match) return match;
    match = voices.find(v =>
      (target.lang.startsWith('zh') ? v.lang.startsWith('zh') : v.lang.startsWith('en')) &&
      (target.gender === 'female' ? v.name.toLowerCase().includes('female') : v.name.toLowerCase().includes('male'))
    );
    return match || voices[0];
  }, [selectedVoice]);

  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    if (!autoSpeak) {
      processingRef.current = false;
      setAiSpeaking(false);
      if (callActiveRef.current) { setCallState('talking'); startListeningRef.current?.(); }
      return;
    }
    const voice = getVoice();
    if (!voice) {
      const cb = () => { window.speechSynthesis.removeEventListener('voiceschanged', cb); speak(text); };
      window.speechSynthesis.addEventListener('voiceschanged', cb);
      if (window.speechSynthesis.getVoices().length > 0) { window.speechSynthesis.removeEventListener('voiceschanged', cb); speak(text); }
      return;
    }
    setAiSpeaking(true);
    setCallState('processing');
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.rate = 0.95; u.pitch = 1.0;
    utteranceRef.current = u;
    u.onend = () => {
      utteranceRef.current = null;
      setAiSpeaking(false); processingRef.current = false;
      if (callActiveRef.current) { setCallState('talking'); startListeningRef.current?.(); }
    };
    u.onerror = (e) => {
      utteranceRef.current = null;
      if (e.error !== 'interrupted' && e.error !== 'canceled') console.warn('TTS error:', e.error);
      setAiSpeaking(false); processingRef.current = false;
      if (callActiveRef.current) { setCallState('talking'); startListeningRef.current?.(); }
    };
    window.speechSynthesis.speak(u);
  }, [autoSpeak, getVoice]);

  // ── Speech Recognition ──
  const createRecognition = useCallback((): any => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = 'zh-CN';
    return r;
  }, []);

  const startListeningInner = useCallback(() => {
    if (!callActiveRef.current || processingRef.current) return;
    if (aiSpeaking && window.speechSynthesis.speaking) return;
    try {
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
      const r = createRecognition();
      if (!r) return;
      recognitionRef.current = r;
      r.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) interim += event.results[i][0].transcript;
        transcriptAccumRef.current = interim; setTranscript(interim);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = window.setTimeout(() => {
          const finalText = transcriptAccumRef.current.trim();
          if (!finalText || !callActiveRef.current || processingRef.current) return;
          try { recognitionRef.current?.stop(); } catch {}; recognitionRef.current = null;
          setListening(false);
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
          setMessages(prev => [...prev, { role: 'user', content: finalText }]);
          setTranscript(''); transcriptAccumRef.current = '';
          scrollToBottom(); sendToAI(finalText);
        }, SILENCE_TIMEOUT);
      };
      r.onerror = (event: any) => {
        const err = event.error;
        if (err === 'not-allowed') { setMicReady(false); setError('麦克风被阻止，请允许后重试。'); return; }
        if (err === 'aborted') return;
        if (callActiveRef.current && !processingRef.current) setTimeout(() => { if (callActiveRef.current && !processingRef.current) startListeningInner(); }, 500);
      };
      r.onend = () => {
        if (callActiveRef.current && !processingRef.current && recognitionRef.current === r) {
          setTimeout(() => { if (callActiveRef.current && !processingRef.current) startListeningInner(); }, 300);
        }
      };
      r.start(); setListening(true); setCallState('talking');
    } catch (e) {
      console.warn('Recognition start failed:', e);
      if (callActiveRef.current && !processingRef.current) setTimeout(() => startListeningInner(), 500);
    }
  }, [createRecognition, scrollToBottom, aiSpeaking]);
  startListeningRef.current = startListeningInner;

  // ── AI ──
  const sendToAI = useCallback(async (text: string) => {
    if (!token || processingRef.current) return;
    processingRef.current = true; setCallState('processing'); setListening(false);
    window.speechSynthesis.cancel();
    const cefrLevel = user?.cefr_level || 'B1';
    try {
      const res = await fetch(`${BASE}/llm/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, cefr_level: cefrLevel }),
      });
      if (!res.ok) {
        if (res.status === 401) { localStorage.removeItem('ll_token'); localStorage.removeItem('ll_user'); window.location.href = '/demo/'; return; }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      const reader = res.body!.getReader(); const decoder = new TextDecoder(); let fullReply = '';
      setMessages(prev => [...prev, { role: 'bot', content: '' }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try { const p = JSON.parse(line.slice(6)); if (p.delta) { fullReply += p.delta; setMessages(prev => { const c = [...prev]; c[c.length-1] = {role:'bot',content:fullReply}; return c; }); } } catch {}
        }
      }
      if (!callActiveRef.current) { processingRef.current = false; return; }
      if (fullReply) { speak(fullReply); }
      else { processingRef.current = false; setCallState('talking'); startListeningRef.current?.(); }
    } catch (err: any) {
      if (!callActiveRef.current) { processingRef.current = false; return; }
      setError(err.message || 'Error');
      processingRef.current = false; setCallState('talking');
      startListeningRef.current?.();
    }
  }, [token, user, speak]);

  // ── Controls ──
  const stopAll = useCallback(() => {
    callActiveRef.current = false; setInCall(false); setListening(false); setCallState('idle');
    setTranscript(''); transcriptAccumRef.current = ''; processingRef.current = false; setAiSpeaking(false);
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    try { recognitionRef.current?.abort(); } catch {}; recognitionRef.current = null;
    window.speechSynthesis.cancel(); utteranceRef.current = null;
  }, []);

  const enableMic = async () => {
    setMicPrompting(true); setError('');
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); setMicReady(true); }
    catch (e: any) { setError(e.name === 'NotAllowedError' ? '麦克风被拒绝' : '未检测到麦克风'); }
    finally { setMicPrompting(false); }
  };

  const startCall = useCallback(() => {
    window.speechSynthesis.getVoices();
    callActiveRef.current = true; setInCall(true); setCallState('connecting'); setError('');
    setMessages([]); setTranscript(''); transcriptAccumRef.current = ''; processingRef.current = false; setAiSpeaking(false);
    const welcome = "你好！我是你的 AI 英语老师，我们可以用中文或英文聊天。你想聊点什么？\nHi! I'm your AI English tutor. We can chat in Chinese or English. What would you like to talk about?";
    setMessages([{ role: 'bot', content: welcome }]);
    setTimeout(() => { if (callActiveRef.current) speak(welcome); }, 600);
  }, [speak]);

  const endCall = useCallback(() => stopAll(), [stopAll]);

  const handleManualSend = useCallback(() => {
    if (!transcript.trim() || processingRef.current) return;
    const text = transcript.trim();
    try { recognitionRef.current?.stop(); } catch {}; recognitionRef.current = null; setListening(false);
    setTranscript(''); transcriptAccumRef.current = '';
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    sendToAI(text);
  }, [transcript, sendToAI]);

  const switchCharacter = (char: CharacterConfig) => {
    setSelectedChar(char); setSelectedVoice(char.voiceIndex);
    localStorage.setItem('ll_character', char.id);
    localStorage.setItem('ll_voice', String(char.voiceIndex));
    humanRef.current?.setCharacter(char);
    setShowSettings(false);
  };

  const changeVoice = (idx: number) => {
    setSelectedVoice(idx);
    localStorage.setItem('ll_voice', String(idx));
    window.speechSynthesis.cancel();
    const v = VOICE_OPTIONS[idx];
    const u = new SpeechSynthesisUtterance(v.gender === 'female' ? 'Hello' : 'Hello');
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(vv => vv.name === v.name);
    if (match) u.voice = match;
    u.lang = v.lang; u.rate = 0.95;
    window.speechSynthesis.speak(u);
    setShowSettings(false);
  };

  // Render
  if (!supported) return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <Mic size={48} className="text-surface-500" />
      <h2 className="text-lg font-semibold">浏览器不支持语音识别</h2>
      <p className="text-sm text-surface-400">需使用 Chrome 或 Edge 浏览器</p>
    </div>
  );

  return (
    <MicPermissionGate>
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center justify-between px-1 pb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-surface-400">{selectedChar.name}</span>
            <button onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-primary-600/20 text-primary-400' : 'text-surface-400 hover:text-surface-300'}`}>
              <Settings size={15} />
            </button>
          </div>
          <button onClick={() => setAutoSpeak(!autoSpeak)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
              autoSpeak ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30' : 'bg-surface-700 text-surface-400'
            }`}>
            {autoSpeak ? <Volume2 size={12} /> : <VolumeX size={12} />}{autoSpeak ? '朗读' : '静音'}
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="mb-2 p-3 bg-surface-800 rounded-xl border border-surface-700 space-y-3">
            {/* Character picker */}
            <div>
              <p className="text-xs text-surface-400 font-medium uppercase tracking-wide mb-2 flex items-center gap-1">
                <Users size={12} /> 角色
              </p>
              <div className="grid grid-cols-3 gap-2">
                {CHARACTERS.map(c => (
                  <button key={c.id} onClick={() => switchCharacter(c)}
                    className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs transition-colors ${
                      selectedChar.id === c.id
                        ? 'bg-primary-600/20 border border-primary-500/40 text-primary-300'
                        : 'bg-surface-700/50 border border-surface-600 text-surface-300 hover:border-surface-500'
                    }`}>
                    <span className="text-lg">{c.gender === 'female' ? '👩' : '👨'}</span>
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Voice picker */}
            <div>
              <p className="text-xs text-surface-400 font-medium uppercase tracking-wide mb-2">音色</p>
              <div className="grid grid-cols-2 gap-2">
                {VOICE_OPTIONS.map((v, i) => (
                  <button key={i} onClick={() => changeVoice(i)}
                    className={`text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      selectedVoice === i ? 'bg-primary-600/20 border border-primary-500/40 text-primary-300' : 'bg-surface-700/50 border border-surface-600 text-surface-300 hover:border-surface-500'
                    }`}>{v.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 text-xs text-red-300">{error}</div>
        )}

        {/* ── Digital Human ── */}
        <div className={`mx-auto transition-all duration-500 flex items-center justify-center ${inCall ? 'w-full max-w-[320px]' : 'w-36 h-36 mt-4 opacity-60'}`}>
          {displayMode === '3d' ? (
            <DigitalHuman ref={humanRef} character={selectedChar} talking={aiSpeaking} listening={listening} width={320} height={380} />
          ) : (
            <Live2DCharacter ref={live2dRef} talking={aiSpeaking} listening={listening} width={320} height={380} />
          )}
        </div>
        {/* 2D/3D 切换 */}
        {inCall && (
          <div className="flex justify-center mb-2">
            <button
              onClick={() => setDisplayMode(m => m === '2d' ? '3d' : '2d')}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-surface-700/50 text-surface-400 hover:text-surface-200 transition-colors border border-surface-600/30"
            >
              {displayMode === '2d' ? <MonitorSmartphone size={12} /> : <Monitor size={12} />}
              {displayMode === '2d' ? '切换到 3D' : '切换到 2D'}
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-2.5 no-scrollbar pb-2 mt-2">
          {!inCall && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 pt-4">
              <h3 className="text-surface-300 font-semibold">AI 数字人通话</h3>
              <p className="text-surface-500 text-xs max-w-xs">像视频通话一样练口语<br />支持中英双语自由对话</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="relative max-w-[82%]">
                <div className={msg.role === 'user' ? 'msg-user' : 'msg-bot'}>
                  <p className="text-xs whitespace-pre-wrap leading-relaxed">
                    {msg.content || (msg.role === 'bot' && callState === 'processing' && i === messages.length - 1 ? '...' : '')}
                  </p>
                </div>
                {msg.role === 'bot' && msg.content && (!inCall || !autoSpeak) && (
                  <button onClick={() => { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(msg.content); const v = getVoice(); if(v){u.voice=v;u.lang=v.lang;} u.rate=0.95; window.speechSynthesis.speak(u); }}
                    className="absolute -right-7 top-1 p-0.5 rounded text-surface-500 hover:text-primary-400">
                    <Volume2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {listening && transcript && (
            <div className="flex justify-end">
              <div className="px-3 py-1.5 rounded-xl bg-surface-800 border border-dashed border-green-500/30">
                <p className="text-xs italic text-green-300/80">{transcript}</p>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-2.5 pt-2 pb-2">
          {!micReady && !inCall && (
            <div className="flex flex-col items-center gap-1.5 bg-surface-800/95 rounded-2xl p-3 border border-surface-700 w-full">
              <p className="text-xs text-surface-400">需要授权麦克风</p>
              <button onClick={enableMic} disabled={micPrompting}
                className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 flex items-center justify-center disabled:opacity-50">
                {micPrompting ? <Loader2 size={20} className="text-black animate-spin" /> : <Mic size={20} className="text-black" />}
              </button>
              <p className="text-[10px] text-amber-400">{micPrompting ? '请求中...' : '点击启用麦克风'}</p>
            </div>
          )}
          {micReady && (
            !inCall ? (
              <>
                <button onClick={startCall}
                  className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95">
                  <Phone size={30} className="text-white" />
                </button>
                <p className="text-sm font-medium text-green-400">开始通话</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${
                    listening ? 'bg-green-400' : callState==='connecting' ? 'bg-yellow-400' : callState==='processing' ? 'bg-blue-400' : 'bg-surface-500'
                  }`} />
                  <span className="text-xs text-surface-300">
                    {listening ? '🎙️ 正在听...' : callState==='connecting' ? '📡 接通中...' : callState==='processing' ? '⏳ 回复中...' : '等待中...'}
                  </span>
                </div>
                <button onClick={endCall}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all hover:scale-105 active:scale-95">
                  <PhoneOff size={30} className="text-white" />
                </button>
                <p className="text-xs font-medium text-red-400">挂断</p>
                <div className="w-full flex items-center gap-2">
                  <input type="text" value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleManualSend(); }}
                    placeholder={listening ? '实时转写中...' : '输入文字...'}
                    className="flex-1 bg-surface-800 border border-surface-600 rounded-xl px-3 py-2 text-xs text-white placeholder-surface-500 focus:outline-none focus:border-primary-500"
                  />
                  <button onClick={handleManualSend} disabled={!transcript.trim() || processingRef.current}
                    className="shrink-0 w-9 h-9 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 flex items-center justify-center">
                    <Sparkles size={14} />
                  </button>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </MicPermissionGate>
  );
}
