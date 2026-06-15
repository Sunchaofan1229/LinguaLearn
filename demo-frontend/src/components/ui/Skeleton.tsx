interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  /** Animate as shimmer */
  animate?: boolean;
}

const roundedMap = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

export function Skeleton({ width, height = 16, rounded = 'md', animate = true, className = '' }: SkeletonProps) {
  return (
    <div
      className={`${animate ? 'skeleton' : 'bg-ink-700/50'} ${roundedMap[rounded]} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** Pre-composed skeleton patterns for common use cases */
export function CardSkeleton() {
  return (
    <div className="card space-y-4">
      <Skeleton width="60%" height={20} rounded="lg" />
      <Skeleton width="100%" height={14} rounded="md" />
      <Skeleton width="80%" height={14} rounded="md" />
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-1">
          <Skeleton width={40} height={40} rounded="xl" />
          <div className="flex-1 space-y-2">
            <Skeleton width="50%" height={14} rounded="md" />
            <Skeleton width="30%" height={12} rounded="md" />
          </div>
        </div>
      ))}
    </div>
  );
}
