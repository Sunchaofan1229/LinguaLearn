import type { HTMLAttributes, ReactNode } from 'react';

type CardVariant = 'default' | 'glow' | 'sage' | 'interactive';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default:     'card',
  glow:        'card-glow',
  sage:        'card-sage',
  interactive: 'card-interactive',
};

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({ variant = 'default', padding = 'md', className = '', children, ...props }: CardProps) {
  return (
    <div className={`${variantClasses[variant]} ${paddingClasses[padding]} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
