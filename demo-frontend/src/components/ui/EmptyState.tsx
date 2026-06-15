import type { ReactNode, ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon | ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-ink-800/80 border border-ink-700/50 flex items-center justify-center mb-5">
          <Icon size={28} className="text-ink-400" />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink-200 mb-1.5 font-[family-name:var(--font-display)]">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-ink-400 max-w-[260px] leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
