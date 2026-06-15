import { ReactNode } from 'react';
import { Mic, MicOff, AlertTriangle, Loader2, ChevronRight, Shield } from 'lucide-react';
import { useMicPermission, MicState } from '../hooks/useMicPermission';

interface Props {
  children: ReactNode;
  onReady?: () => void;
}

const STATE_UI: Record<MicState, {
  icon: typeof Mic;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
}> = {
  checking: {
    icon: Loader2,
    title: '检测麦克风',
    description: '正在检查麦克风权限...',
    iconBg: 'bg-surface-700',
    iconColor: 'text-surface-400',
  },
  prompt: {
    icon: Mic,
    title: '需要授权麦克风',
    description: '点击下方按钮，浏览器会弹出权限请求',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-400',
  },
  ready: {
    icon: Mic,
    title: '麦克风已就绪',
    description: '可以使用语音功能了',
    iconBg: 'bg-green-500/20',
    iconColor: 'text-green-400',
  },
  denied: {
    icon: MicOff,
    title: '麦克风被拒绝',
    description: '请在地址栏左侧点击 🔒 → 允许麦克风 → 刷新页面',
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-400',
  },
  error: {
    icon: AlertTriangle,
    title: '麦克风异常',
    description: '',
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-400',
  },
};

export default function MicPermissionGate({ children, onReady }: Props) {
  const { state, errorMsg, requestPermission } = useMicPermission();

  if (state === 'ready') {
    return <>{children}</>;
  }

  const ui = STATE_UI[state];
  const Icon = ui.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full sm:max-w-sm bg-surface-900 sm:rounded-2xl rounded-t-2xl p-6 border border-surface-700 animate-slide-up">
        {/* Icon */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className={`w-16 h-16 rounded-2xl ${ui.iconBg} flex items-center justify-center ${state === 'checking' ? 'animate-spin' : ''}`}>
            <Icon size={32} className={ui.iconColor} />
          </div>

          <div>
            <h2 className="text-lg font-semibold">{ui.title}</h2>
            <p className="text-sm text-surface-400 mt-1">
              {errorMsg || ui.description}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3">
          {state === 'prompt' && (
            <>
              <button
                onClick={requestPermission}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl px-4 py-3 font-medium transition-colors active:scale-[0.98]"
              >
                <Shield size={18} />
                授予麦克风权限
              </button>
              <p className="text-center text-[11px] text-surface-500">
                你的语音数据仅在本地处理，不会上传
              </p>
            </>
          )}

          {state === 'denied' && (
            <button
              onClick={requestPermission}
              className="w-full flex items-center justify-center gap-2 bg-amber-600/20 border border-amber-500/30 hover:bg-amber-600/30 text-amber-300 rounded-xl px-4 py-3 font-medium transition-colors active:scale-[0.98]"
            >
              <Mic size={18} />
              重新请求权限
            </button>
          )}

          {state === 'error' && (
            <button
              onClick={requestPermission}
              className="w-full flex items-center justify-center gap-2 bg-surface-700 hover:bg-surface-600 text-surface-300 rounded-xl px-4 py-3 font-medium transition-colors active:scale-[0.98]"
            >
              重试
            </button>
          )}

          {state === 'checking' && (
            <div className="text-center">
              <p className="text-xs text-surface-500 animate-pulse">请稍候...</p>
            </div>
          )}
        </div>

        {/* Guide for denied */}
        {state === 'denied' && (
          <div className="mt-4 p-3 bg-surface-800 rounded-xl border border-surface-700">
            <p className="text-xs text-surface-400 font-medium mb-2">手动解除屏蔽：</p>
            <ol className="text-xs text-surface-500 space-y-1">
              <li>1. 点击地址栏左侧 <span className="text-amber-400">🔒</span> 图标</li>
              <li>2. 找到「麦克风」→ 改为「允许」</li>
              <li>3. <span className="text-primary-400 cursor-pointer" onClick={() => window.location.reload()}>刷新页面</span></li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
