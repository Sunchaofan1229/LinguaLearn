import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useHiggsTTS } from '../hooks/useHiggsTTS';
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2, Sparkles, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import MicPermissionGate from '../components/MicPermissionGate';

const BASE = '/api/v1';
const SILENCE_TIMEOUT = 2000;

interface Message {
  role: 'user' | 'bot';
  content: string;
}

interface VoiceOption {
  name: string;
  lang: string;
  label: string;
  gender: 'male' | 'female';
}

const VOICE_OPTIONS: VoiceOption[] = [
  { name: 'Google US English', lang: 'en-US', label: '🗣️ 年轻女声 (EN)', gender: 'female' },
  { name: 'Google UK English Female', lang: 'en-GB', label: '🗣️ 英伦女声', gender: 'female' },
  { name: 'Google UK English Male', lang: 'en-GB', label: '🗣️ 成熟男声 (EN)', gender: 'male' },
  { name: 'Microsoft Xiaoxiao', lang: 'zh-CN', label: '🗣️ 晓晓 (中文女声)', gender: 'female' },
  { name: 'Microsoft Yunxi', lang: 'zh-CN', label: '🗣️ 云希 (中文男声)', gender: 'male' },
  { name: 'Google 普通话', lang: 'zh-CN', label: '🗣️ 普通话女声', gender: 'female' },
];

export default function VoiceChat() {
  const { token, user } = useAuth();
  const { speakStream: ttsSpeakStream, stop: ttsStop } = useHiggsTTS();
  const navigate = useNavigate();
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
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'talking' | 'processing'>('idle');

  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimer = useRef<number | null>(null);
  const transcriptAccumRef = useRef('');
  const callActiveRef = useRef(false);
  const processingRef = useRef(false);
  const lastVoiceRef = useRef(0);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); }
    // Load saved voice preference
    const saved = localStorage.getItem('ll_voice');
    if (saved) {
      const idx = parseInt(saved);
      if (!isNaN(idx) && idx < VOICE_OPTIONS.length) {
        setSelectedVoice(idx);
        lastVoiceRef.current = idx;
      }
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages]);

  // TTS speak via Boson Higgs Audio (streaming PCM)
  const speak = useCallback((text: string) => {
    if (!autoSpeak) {
      processingRef.current = false;
      if (callActiveRef.current) { startListening(); }
      return;
    }
    ttsSpeakStream(
      text,
      'nova',
      // onStart
      () => {
        setAiSpeaking(true);
        setCallState('processing');
      },
      // onEnd
      () => {
        setAiSpeaking(false);
        processingRef.current = false;
        if (callActiveRef.current) {
          setCallState('talking');
          startListening();
        }
      },
    );
  }, [autoSpeak, ttsSpeakStream]);

  // SSE chat
  const sendToAI = async (text: string) => {
    if (!token || processingRef.current) return;
    processingRef.current = true;
    setCallState('processing');

    const cefrLevel = user?.cefr_level || 'B1';
    try {
      const res = await fetch(`${BASE}/llm/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, cefr_level: cefrLevel }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('ll_token');
          localStorage.removeItem('ll_user');
          window.location.href = '/demo/';
          return;
        }
        const data = await res.json().catch(() => ({}));
        const detail = data.detail;
        throw new Error(Array.isArray(detail) ? detail.map((d: any) => d.msg).join('; ') : (detail || 'Error'));
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
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'bot', content: fullReply };
                return copy;
              });
            }
          } catch {}
        }
      }

      if (fullReply) {
        speak(fullReply);
      } else {
        processingRef.current = false;
        if (callActiveRef.current) { setCallState('talking'); startListening(); }
      }
    } catch (err: any) {
      setError(err.message || 'Connection error');
      processingRef.current = false;
      if (callActiveRef.current) { setCallState('talking'); startListening(); }
    }
  };

  // Speech recognition factory
  const createRecognition = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'zh-CN'; // Supports both Chinese and English
    return r;
  };

  // Start listening loop
  const startListening = useCallback(() => {
    if (!callActiveRef.current || processingRef.current) return;
    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      const r = createRecognition();
      if (!r) return;
      recognitionRef.current = r;

      r.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          interim += event.results[i][0].transcript;
        }
        transcriptAccumRef.current = interim;
        setTranscript(interim);

        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        silenceTimer.current = window.setTimeout(() => {
          const finalText = transcriptAccumRef.current.trim();
          if (finalText && callActiveRef.current && !processingRef.current) {
            // Stop current recognition
            try { recognitionRef.current?.stop(); } catch {}
            recognitionRef.current = null;
            setListening(false);
            if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null; }

            setMessages(prev => [...prev, { role: 'user', content: finalText }]);
            setTranscript('');
            transcriptAccumRef.current = '';
            scrollToBottom();
            sendToAI(finalText);
          }
        }, SILENCE_TIMEOUT);
      };

      r.onerror = (event: any) => {
        const err = event.error;
        if (err === 'not-allowed') {
          setMicReady(false);
          setError('麦克风被阻止，请允许后重试。');
        }
        // Auto-restart for transient errors
        if (callActiveRef.current && !processingRef.current &&
            err !== 'not-allowed' && err !== 'aborted') {
          setTimeout(() => {
            if (callActiveRef.current && !processingRef.current) {
              startListening();
            }
          }, 500);
        }
      };

      r.onend = () => {
        // Only auto-restart if not stopped intentionally and not processing
        if (callActiveRef.current && !processingRef.current && recognitionRef.current === r) {
          setTimeout(() => {
            if (callActiveRef.current && !processingRef.current) {
              startListening();
            }
          }, 300);
        }
      };

      r.start();
      setListening(true);
      setCallState('talking');
    } catch (e) {
      console.warn('Recognition start failed:', e);
      // Retry
      if (callActiveRef.current && !processingRef.current) {
        setTimeout(() => startListening(), 500);
      }
    }
  }, [scrollToBottom]);

  const stopAll = () => {
    callActiveRef.current = false;
    setInCall(false);
    setListening(false);
    setCallState('idle');
    setTranscript('');
    transcriptAccumRef.current = '';
    processingRef.current = false;
    setAiSpeaking(false);
    if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null; }
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    ttsStop();
  };

  const enableMic = async () => {
    setMicPrompting(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicReady(true);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('麦克风被拒绝。请在浏览器地址栏点击 🔒 → 允许麦克风 → 刷新。');
      } else {
        setError('未检测到麦克风设备。');
      }
    } finally { setMicPrompting(false); }
  };

  const startCall = () => {
    callActiveRef.current = true;
    setInCall(true);
    setCallState('connecting');
    setError('');
    setMessages([]);
    setTranscript('');
    transcriptAccumRef.current = '';
    processingRef.current = false;

    const welcome = "你好！我是你的 AI 英语老师，我们可以用中文或英文聊天。你想聊点什么？\nHi! I'm your AI English tutor. We can chat in Chinese or English. What would you like to talk about?";
    setMessages([{ role: 'bot', content: welcome }]);

    setTimeout(() => {
      if (callActiveRef.current) {
        speak(welcome);
        // startListening will be called from TTS onend
      }
    }, 500);
  };

  const endCall = () => { stopAll(); };

  const handleManualSend = () => {
    if (!transcript.trim() || processingRef.current) return;
    const text = transcript.trim();
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setTranscript('');
    transcriptAccumRef.current = '';
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setListening(false);
    sendToAI(text);
  };

  const changeVoice = (idx: number) => {
    setSelectedVoice(idx);
    lastVoiceRef.current = idx;
    localStorage.setItem('ll_voice', String(idx));
    // Preview
    window.speechSynthesis?.cancel();
    const v = VOICE_OPTIONS[idx];
    const u = new SpeechSynthesisUtterance(v.gender === 'female' ? 'Hello, I am your AI tutor.' : 'Hello, I am your AI tutor.');
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(vv => vv.name === v.name);
    if (match) u.voice = match;
    u.lang = v.lang;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
    setShowSettings(false);
  };

  if (!supported) {
    return (
      <div className="page flex flex-col items-center justify-center text-center gap-4">
        <MicOff size={48} className="text-surface-500" />
        <h2 className="text-lg font-semibold">浏览器不支持</h2>
        <p className="text-sm text-surface-400 max-w-xs">
          语音对话需使用 Chrome 或 Edge 浏览器。
        </p>
      </div>
    );
  }

  return (
    <MicPermissionGate>
    <div className="flex flex-col h-[100dvh]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-700 bg-surface-900/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { if (inCall) endCall(); navigate(-1); }} className="p-1">
              <ArrowLeft size={20} className="text-surface-400" />
            </button>
            <div>
              <h1 className="text-base font-semibold">🎤 语音通话</h1>
              <p className="text-xs text-surface-400">
                {callState === 'idle' && '点击开始'}
                {callState === 'connecting' && '正在连接...'}
                {callState === 'talking' && '🟢 通话中'}
                {callState === 'processing' && (aiSpeaking ? '🔊 AI 回复中' : '⏳ 处理中')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Settings button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-primary-600/20 text-primary-400' : 'text-surface-400 hover:text-surface-300'}`}
            >
              <Settings size={18} />
            </button>
            <button
              onClick={() => setAutoSpeak(!autoSpeak)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs transition-colors ${
                autoSpeak ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30' : 'bg-surface-700 text-surface-400'
              }`}
            >
              {autoSpeak ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {autoSpeak ? '朗读' : '静音'}
            </button>
          </div>
        </div>
      </div>

      {/* Voice settings panel */}
      {showSettings && (
        <div className="mx-4 mt-2 p-3 bg-surface-800 rounded-xl border border-surface-700 space-y-2">
          <p className="text-xs text-surface-400 font-medium uppercase tracking-wide">音色选择</p>
          <div className="grid grid-cols-2 gap-2">
            {VOICE_OPTIONS.map((v, i) => (
              <button
                key={i}
                onClick={() => changeVoice(i)}
                className={`text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  selectedVoice === i
                    ? 'bg-primary-600/20 border border-primary-500/40 text-primary-300'
                    : 'bg-surface-700/50 border border-surface-600 text-surface-300 hover:border-surface-500'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar ${inCall ? 'pb-40' : 'pb-48'}`}>
        {messages.length === 0 && !inCall && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary-600/20 flex items-center justify-center">
              <Phone size={32} className="text-primary-400" />
            </div>
            <h3 className="text-surface-300 font-medium">AI 语音通话</h3>
            <p className="text-surface-500 text-sm max-w-xs">
              点击开始后自由说话，AI 会自动识别并回复。<br/>
              支持中文和英文双语对话。
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="relative max-w-[85%]">
              <div className={msg.role === 'user' ? 'msg-user' : 'msg-bot'}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {msg.content || (msg.role === 'bot' && callState === 'processing' ? '...' : '')}
                </p>
              </div>
              {msg.role === 'bot' && msg.content && (
                <button
                  onClick={() => speak(msg.content)}
                  className="absolute -right-7 top-1 p-0.5 rounded text-surface-500 hover:text-primary-400 transition-colors"
                >
                  <Volume2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Live transcript */}
        {listening && transcript && (
          <div className="flex justify-end">
            <div className="msg-user opacity-60 border-dashed border-primary-400/30">
              <p className="text-sm italic text-surface-300">{transcript}</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Bottom controls */}
      <div className="fixed bottom-0 left-0 right-0 z-40 pb-6">
        <div className="max-w-lg mx-auto px-4">
          {!micReady && !inCall && (
            <div className="flex flex-col items-center gap-3 bg-surface-800/95 backdrop-blur rounded-2xl p-5 border border-surface-700">
              <p className="text-sm text-surface-400">需要授权麦克风以开始通话</p>
              <button
                onClick={enableMic}
                disabled={micPrompting}
                className="w-16 h-16 rounded-full bg-amber-500 hover:bg-amber-400 flex items-center justify-center transition-all disabled:opacity-50"
              >
                {micPrompting ? <Loader2 size={28} className="text-black animate-spin" /> : <Mic size={28} className="text-black" />}
              </button>
              <p className="text-xs text-amber-400 font-medium">{micPrompting ? '请求权限中...' : '点击启用麦克风'}</p>
            </div>
          )}

          {micReady && (
            <div className="flex flex-col items-center gap-3">
              {!inCall ? (
                <>
                  <button
                    onClick={startCall}
                    className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95"
                  >
                    <Phone size={36} className="text-white" />
                  </button>
                  <p className="text-sm font-medium text-green-400">开始通话</p>
                </>
              ) : (
                <>
                  {/* Status line */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                      listening ? 'bg-green-400' : callState === 'processing' ? 'bg-blue-400' : 'bg-surface-500'
                    }`} />
                    <span className="text-sm text-surface-300">
                      {listening ? '🎙️ 正在听...' : callState === 'connecting' ? '📡 连接中...' : '⏳ 处理中...'}
                    </span>
                  </div>

                  <button
                    onClick={endCall}
                    className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
                  >
                    <PhoneOff size={36} className="text-white" />
                  </button>
                  <p className="text-sm font-medium text-red-400">挂断</p>

                  {/* Text input fallback */}
                  <div className="w-full flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      value={transcript}
                      onChange={e => setTranscript(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleManualSend(); }}
                      placeholder={listening ? '你说的话会实时显示...' : '输入文字发送...'}
                      className="flex-1 bg-surface-800 border border-surface-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500"
                    />
                    <button
                      onClick={handleManualSend}
                      disabled={!transcript.trim() || processingRef.current}
                      className="shrink-0 w-10 h-10 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 flex items-center justify-center"
                    >
                      <Sparkles size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </MicPermissionGate>
  );
}
