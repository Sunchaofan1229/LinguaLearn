import type { ImgHTMLAttributes } from 'react';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

const initials = (name?: string) => {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
};

export function Avatar({ src, alt = '', name, size = 'md', className = '' }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt || name || 'avatar'}
        className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-ink-700/50 ${className}`}
      />
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-brand-500/15 text-brand-400 flex items-center justify-center font-semibold font-[family-name:var(--font-display)] ring-2 ring-ink-700/50 ${className}`}>
      {initials(name)}
    </div>
  );
}
