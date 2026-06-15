import type { ReactNode } from 'react';

type BadgeColor = 'brand' | 'sage' | 'blue' | 'purple' | 'red' | 'amber' | 'gray';

interface BadgeProps {
  color?: BadgeColor;
  children: ReactNode;
  className?: string;
  /** Optional dot indicator */
  dot?: boolean;
}

const colorClasses: Record<BadgeColor, string> = {
  brand:  'badge-brand',
  sage:   'badge-sage',
  blue:   'badge-blue',
  purple: 'badge-purple',
  red:    'badge-red',
  amber:  'badge-amber',
  gray:   'bg-ink-700/60 text-ink-300 border border-ink-600/50',
};

const dotColors: Record<BadgeColor, string> = {
  brand:  'bg-brand-400',
  sage:   'bg-sage-400',
  blue:   'bg-blue-400',
  purple: 'bg-purple-400',
  red:    'bg-red-400',
  amber:  'bg-amber-400',
  gray:   'bg-ink-400',
};

export function Badge({ color = 'gray', dot, className = '', children }: BadgeProps) {
  return (
    <span className={`badge ${colorClasses[color]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[color]}`} />}
      {children}
    </span>
  );
}
