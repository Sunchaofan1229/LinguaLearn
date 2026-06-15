import { forwardRef, type InputHTMLAttributes } from 'react';

type InputSize = 'sm' | 'md' | 'lg';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visual size variant */
  inputSize?: InputSize;
  /** Error message to display below input */
  error?: string;
  /** Label above input */
  label?: string;
  /** Helper text below input */
  helper?: string;
  /** Full width */
  fullWidth?: boolean;
}

const sizeClasses: Record<InputSize, string> = {
  sm: 'input-field-sm',
  md: 'input-field',
  lg: 'input-field-lg',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = 'md', error, label, helper, fullWidth, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className={`${fullWidth ? 'w-full' : ''} space-y-1.5`}>
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-ink-300 font-[family-name:var(--font-display)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${sizeClasses[inputSize]} ${error ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : ''} ${fullWidth ? 'w-full' : ''} ${className}`.trim()}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-400" role="alert">{error}</p>
        )}
        {helper && !error && (
          <p id={`${inputId}-helper`} className="text-xs text-ink-400">{helper}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
