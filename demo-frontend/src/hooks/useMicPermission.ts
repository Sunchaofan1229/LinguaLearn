/**
 * useMicPermission — 麦克风权限管理 Hook
 * 
 * 解决三大问题：
 * 1. IP + 自签名证书下权限不持久化 → 会话内复用 MediaStream
 * 2. 需要用户手势才能触发授权 → 自动检测 + 优雅引导
 * 3. 重复弹窗 → 单例管理，同一会话只申请一次
 * 
 * 优先自修复：如果之前已授权，会自动激活（不弹窗）
 * 仅在首次或权限被拒时才显示引导UI
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export type MicState = 
  | 'checking'    // 检查权限中
  | 'prompt'      // 需要用户授权（首次）
  | 'ready'       // 已就绪
  | 'denied'      // 被拒绝
  | 'error';      // 硬件错误

export function useMicPermission() {
  const [state, setState] = useState<MicState>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const streamRef = useRef<MediaStream | null>(null);

  // 检查权限状态
  const checkPermission = useCallback(async () => {
    setState('checking');
    setErrorMsg('');

    // Step 1: 检查 Permission API
    try {
      if (navigator.permissions) {
        const permStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        
        if (permStatus.state === 'granted') {
          // 之前已授权，直接激活
          enableMicSilent();
          return;
        }
        
        // 监听权限变化
        permStatus.onchange = () => {
          if (permStatus.state === 'granted') enableMicSilent();
          else if (permStatus.state === 'denied') setState('denied');
        };
      }
    } catch {
      // Permission API 不可用（非 HTTPS 或旧浏览器），跳过
    }

    // Step 2: 如果已有缓存的 stream，直接复用
    if (streamRef.current) {
      const tracks = streamRef.current.getAudioTracks();
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        setState('ready');
        return;
      }
    }

    // Step 3: 尝试静默获取（可能直接成功而不弹窗）
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      streamRef.current = stream;
      setState('ready');
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setState('prompt');
        setErrorMsg('需要麦克风权限才能使用语音功能');
      } else if (err.name === 'NotFoundError') {
        setState('error');
        setErrorMsg('未检测到麦克风设备');
      } else {
        setState('error');
        setErrorMsg('麦克风异常：' + (err.message || '未知错误'));
      }
    }
  }, []);

  // 静默激活（不触发 Permission API 的回调循环）
  const enableMicSilent = async () => {
    try {
      if (streamRef.current) {
        const tracks = streamRef.current.getAudioTracks();
        if (tracks.length > 0 && tracks[0].readyState === 'live') {
          setState('ready');
          return;
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      streamRef.current = stream;
      setState('ready');
    } catch {
      // 静默失败，不改变 state
    }
  };

  // 用户主动授权（点击按钮触发，满足浏览器安全策略）
  const requestPermission = useCallback(async () => {
    setState('checking');
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      streamRef.current = stream;
      setState('ready');
      return stream;
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setState('denied');
        setErrorMsg('麦克风权限被拒绝。请点击地址栏左侧 🔒 → 允许麦克风 → 刷新页面');
      } else if (err.name === 'NotFoundError') {
        setState('error');
        setErrorMsg('未检测到麦克风设备');
      } else {
        setState('error');
        setErrorMsg('麦克风错误：' + (err.message || '未知错误'));
      }
      return null;
    }
  }, []);

  // 页面加载时自动检查
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  // 释放资源
  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setState('prompt');
  }, []);

  return { state, errorMsg, requestPermission, release, getStream: () => streamRef.current };
}
