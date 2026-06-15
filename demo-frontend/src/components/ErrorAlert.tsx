interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 px-4">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
        <span className="text-2xl">⚠️</span>
      </div>
      <p className="text-surface-300 text-sm text-center">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary !w-auto px-6 py-2 text-sm">
          重试
        </button>
      )}
    </div>
  );
}
