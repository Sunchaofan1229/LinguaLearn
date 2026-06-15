import { useState, useEffect, useCallback } from 'react';
import { type ReactNode } from 'react';
import { X, ArrowRight } from 'lucide-react';

interface TooltipStep {
  /** Unique id for this tooltip step (used for localStorage) */
  id: string;
  /** Title shown at the top */
  title: string;
  /** Description text */
  description: string;
  /** Which position on screen the tooltip appears */
  position: 'top' | 'bottom' | 'center';
  /** Optional offset from top (only for 'top' and 'bottom') */
  offset?: number;
  /** Optional target element selector for positioning arrow */
  targetSelector?: string;
  /** Icon to show */
  icon?: ReactNode;
}

interface FirstUseTooltipProps {
  /** Storage key for persisting seen state */
  storageKey: string;
  /** Steps to show (supports single or multiple) */
  steps: TooltipStep[];
  /** Children to render behind the overlay */
  children?: ReactNode;
  /** Callback when all steps are completed */
  onComplete?: () => void;
  /** Whether to show a skip button */
  showSkip?: boolean;
}

export function FirstUseTooltip({
  storageKey,
  steps,
  children,
  onComplete,
  showSkip = true,
}: FirstUseTooltipProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(`lingualearn_tooltip_${storageKey}`);
    if (!seen && steps.length > 0) {
      const timer = setTimeout(() => {
        setVisible(true);
        setAnimating(true);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [storageKey, steps.length]);

  const dismiss = useCallback(() => {
    setAnimating(false);
    setTimeout(() => {
      setVisible(false);
      localStorage.setItem(`lingualearn_tooltip_${storageKey}`, 'true');
      onComplete?.();
    }, 200);
  }, [storageKey, onComplete]);

  const next = useCallback(() => {
    if (activeStep < steps.length - 1) {
      setAnimating(false);
      setTimeout(() => {
        setActiveStep(prev => prev + 1);
        setAnimating(true);
      }, 150);
    } else {
      dismiss();
    }
  }, [activeStep, steps.length, dismiss]);

  if (!visible || steps.length === 0) return <>{children}</>;

  const step = steps[activeStep];
  const isLast = activeStep === steps.length - 1;

  const positionStyles: Record<string, string> = {
    top: 'top-0 left-0 right-0 pt-6',
    center: 'inset-0 flex items-center justify-center',
    bottom: 'bottom-0 left-0 right-0 pb-28',
  };

  return (
    <div className="relative">
      {children}
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm transition-opacity duration-200 ${
          animating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={showSkip ? dismiss : undefined}
      />
      {/* Tooltip content */}
      <div
        className={`fixed left-4 right-4 z-50 mx-auto max-w-sm transition-all duration-200 ${
          animating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        } ${positionStyles[step.position]}`}
        style={{ marginTop: step.offset ? `${step.offset}px` : undefined }}
      >
        <div
          className="bg-ink-800/95 border border-brand-500/20 rounded-2xl p-5 shadow-elevated backdrop-blur-md"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            {step.icon ? (
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                {step.icon}
              </div>
            ) : null}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold text-brand-400 font-[family-name:var(--font-display)] tracking-wider uppercase">
                  {steps.length > 1 ? `指引 ${activeStep + 1}/${steps.length}` : '功能指引'}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-ink-100 font-[family-name:var(--font-display)]">
                {step.title}
              </h4>
            </div>
            {showSkip && (
              <button
                onClick={dismiss}
                className="p-1.5 rounded-lg text-ink-500 hover:text-ink-300 hover:bg-ink-700/50 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-ink-300 leading-relaxed mb-4">
            {step.description}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {steps.length > 1 && steps.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === activeStep ? 'bg-brand-400' : 'bg-ink-600'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={next}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 text-ink-950 text-xs font-semibold hover:bg-brand-400 transition-colors font-[family-name:var(--font-display)]"
            >
              {isLast ? '知道了' : '下一步'}
              <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* Arrow */}
        {step.position !== 'center' && (
          <div className="flex justify-center">
            <div
              className={`w-3 h-3 bg-ink-800 rotate-45 border-brand-500/20 ${
                step.position === 'top' ? '-mt-[7px] border-l border-t' : '-mb-[7px] border-r border-b'
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Pre-configured tooltip content for specific pages.
 * Use these to quickly add first-use guidance to any page.
 */
export const SNAP_PAGE_TIPS: TooltipStep[] = [
  {
    id: 'snap-intro',
    title: '拍摄英文场景，秒变词汇',
    description: '对准生活中的英文文字拍照，AI 会自动识别单词，按你的水平推荐学习内容，一键加入生词本。',
    position: 'center',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    ),
  },
];

export const SIMUL_PAGE_TIPS: TooltipStep[] = [
  {
    id: 'simul-mode',
    title: '选择同传模式',
    description: '中译英模式适合中文演讲翻译，英译中模式帮你实时理解英文内容。点击圆形按钮开始，再次点击停止。',
    position: 'center',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
        <circle cx="12" cy="12" r="2"/>
        <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/>
      </svg>
    ),
  },
  {
    id: 'simul-features',
    title: '查看翻译结果',
    description: '原文和翻译会实时分区显示。翻译完成后，可以一键复制全部内容，或使用切换按钮反转翻译方向。',
    position: 'bottom',
    offset: 60,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
        <rect x="8" y="2" width="8" height="4" rx="1"/>
        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
        <path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>
      </svg>
    ),
  },
];

export default FirstUseTooltip;
