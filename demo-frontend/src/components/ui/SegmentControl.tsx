import type { ReactNode } from 'react';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentControl<T extends string>({ options, value, onChange, className = '' }: SegmentControlProps<T>) {
  return (
    <div className={`segment ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`segment-item ${opt.value === value ? 'segment-item-active' : 'segment-item-inactive'}`}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
