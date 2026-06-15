import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <CrashFallback error={this.state.error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

function CrashFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-ink-950">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
        <AlertTriangle size={32} className="text-red-400" />
      </div>
      <h1 className="text-xl font-bold text-ink-100 mb-2 font-[family-name:var(--font-display)]">
        页面出现错误
      </h1>
      <p className="text-sm text-ink-400 max-w-sm mb-6 leading-relaxed">
        抱歉，应用遇到了意外问题。请尝试刷新页面，如果问题持续存在，请联系我们。
      </p>
      {error && (
        <div className="bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-2 mb-6 max-w-sm">
          <p className="text-xs text-red-400/80 font-mono break-all">{error.message}</p>
        </div>
      )}
      <button
        onClick={onReset}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink-950 text-sm font-semibold transition-all duration-200 active:scale-95 font-[family-name:var(--font-display)]"
      >
        <RefreshCw size={16} />
        重试
      </button>
      <p className="mt-4 text-xs text-ink-600 font-[family-name:var(--font-display)]">
        若刷新后仍无法解决，<button onClick={() => window.location.reload()} className="text-brand-400 hover:text-brand-300 underline transition-colors">点击此处刷新整个应用</button>
      </p>
    </div>
  );
}
