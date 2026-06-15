interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'brand' | 'sage';
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const colorClasses = {
  brand: 'progress-fill-brand',
  sage: 'progress-fill-sage',
};

const sizeClasses = {
  sm: 'h-1.5',
  md: 'h-2.5',
};

export function ProgressBar({ value, max = 100, color = 'brand', size = 'md', showLabel, className = '' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className={`progress-track ${sizeClasses[size]}`}>
        <div
          className={`progress-fill ${colorClasses[color]} ${sizeClasses[size]}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-ink-400 font-medium font-[family-name:var(--font-display)]">
          {Math.round(pct)}%
        </p>
      )}
    </div>
  );
}
