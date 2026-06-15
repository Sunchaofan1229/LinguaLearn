import { useRef, useCallback } from 'react';
import { useAuth } from './useAuth';

const BASE = '/api/v1';

/**
 * Boson Higgs Audio v3 TTS hook.
 *
 * Provides `speak()` for non-streaming MP3 playback and
 * `speakStream()` for low-latency PCM streaming via Web Audio API.
 *
 * Voices: default, jake, nova, shimmer, echo, onyx, alloy, fable
 * (see https://docs.boson.ai/models/higgs-audio-tts/voices)
 */
export function useHiggsTTS() {
  const { token } = useAuth();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    return audioCtxRef.current;
  }, []);

  const stop = useCallback(() => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
  }, []);

  /**
   * Non-streaming TTS: POST → MP3 blob → Audio.play()
   * Good for: clicking a 🔊 button on a completed message.
   */
  const speak = useCallback(async (
    text: string,
    voice: string = 'nova',
  ): Promise<void> => {
    if (!token || !text.trim()) return;
    stop();

    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    try {
      const res = await fetch(`${BASE}/tts/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          voice,
          response_format: 'mp3',
          stream: false,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('TTS error:', res.status, detail);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('TTS speak failed:', e);
      }
    } finally {
      if (abortCtrlRef.current === ctrl) abortCtrlRef.current = null;
    }
  }, [token, stop]);

  /**
   * Streaming TTS: POST (stream=true, pcm) → PCM bytes → Web Audio API
   * Good for: voice call mode where you want lowest possible latency.
   * PCM format: 16-bit signed integer, 24kHz, mono, little-endian.
   *
   * Returns a promise that resolves when playback finishes.
   */
  const speakStream = useCallback(async (
    text: string,
    voice: string = 'nova',
    onStart?: () => void,
    onEnd?: () => void,
  ): Promise<void> => {
    if (!token || !text.trim()) return;
    stop();

    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    try {
      const res = await fetch(`${BASE}/tts/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          voice,
          response_format: 'pcm',
          stream: true,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        console.error('TTS stream error:', res.status);
        onEnd?.();
        return;
      }

      const ctx = getAudioCtx();

      // Read entire PCM response (streaming from Boson, buffered here)
      const buffer = await res.arrayBuffer();
      if (ctrl.signal.aborted) { onEnd?.(); return; }

      const pcmData = new Int16Array(buffer);

      // Create AudioBuffer: 24kHz, mono, 16-bit
      const audioBuffer = ctx.createBuffer(1, pcmData.length, 24000);
      const channel = audioBuffer.getChannelData(0);

      // Convert Int16 → Float32 (Web Audio range: -1.0 to 1.0)
      for (let i = 0; i < pcmData.length; i++) {
        channel[i] = pcmData[i] / 32768;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      source.onended = () => onEnd?.();
      source.start();
      onStart?.();
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('TTS stream failed:', e);
      }
      onEnd?.();
    } finally {
      if (abortCtrlRef.current === ctrl) abortCtrlRef.current = null;
    }
  }, [token, stop, getAudioCtx]);

  return { speak, speakStream, stop };
}
