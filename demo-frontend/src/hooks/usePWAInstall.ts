import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as any).standalone) return; // iOS

    // Check if previously dismissed
    const dismissedAt = localStorage.getItem('ll_pwa_dismissed');
    if (dismissedAt) {
      const hours = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60);
      if (hours < 72) { setDismissed(true); return; }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      const prompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(prompt);
      setIsInstallable(true);
      // Show banner after a short delay
      setTimeout(() => setShowBanner(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Handle native install on iOS (no beforeinstallprompt)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS && !dismissed) {
      setIsInstallable(true);
      setTimeout(() => setShowBanner(true), 3000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [dismissed]);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowBanner(false);
      return outcome === 'accepted';
    }
    // iOS fallback - show instructions
    return false;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setShowBanner(false);
    setDismissed(true);
    localStorage.setItem('ll_pwa_dismissed', String(Date.now()));
  }, []);

  return { isInstallable, showBanner, install, dismiss, deferredPrompt };
}
