import { Download, X, Monitor, Share2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export default function PWAInstallBanner() {
  const { showBanner, install, dismiss, deferredPrompt } = usePWAInstall();

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const handleInstall = async () => {
    const accepted = await install();
    if (!accepted && isIOS) {
      // Show iOS instructions
      alert('安装说明：\n1. 点击 Safari 底部的 "分享" 按钮\n2. 滑动找到 "添加到主屏幕"\n3. 点击 "添加" 即可');
    }
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 animate-slide-down max-w-lg mx-auto">
      <div className="bg-surface-800/95 backdrop-blur-xl border border-brand-500/30 rounded-2xl p-4 shadow-2xl shadow-brand-500/10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
            {isIOS ? <Share2 size={20} className="text-brand-400" /> : <Download size={20} className="text-brand-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-100 font-[family-name:var(--font-display)]">
              安装 LinguaLearn
            </p>
            <p className="text-xs text-ink-400 mt-0.5">
              {isIOS
                ? '使用 Safari 分享菜单 → 添加到主屏幕'
                : '将应用安装到桌面，随时随地学习'}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold transition-all duration-200 active:scale-95 font-[family-name:var(--font-display)]"
              >
                {isIOS ? <Share2 size={13} /> : <Monitor size={13} />}
                {isIOS ? '查看教程' : '安装应用'}
              </button>
              <button
                onClick={dismiss}
                className="px-4 py-2 rounded-xl bg-ink-700/80 hover:bg-ink-700 text-ink-300 text-xs font-medium transition-colors font-[family-name:var(--font-display)]"
              >
                暂不需要
              </button>
            </div>
          </div>
          <button onClick={dismiss} className="p-1.5 rounded-lg text-ink-500 hover:text-ink-300 hover:bg-ink-700/50 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
