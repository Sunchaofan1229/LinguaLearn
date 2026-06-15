interface LoadingProps {
  text?: string;
}

export default function Loading({ text = '加载中...' }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative">
        <div className="w-10 h-10 rounded-full border-[3px] border-ink-700/50" />
        <div className="absolute inset-0 w-10 h-10 rounded-full border-[3px] border-transparent border-t-brand-500 animate-spin" />
      </div>
      <p className="text-sm text-ink-400 font-medium font-[family-name:var(--font-display)]">{text}</p>
    </div>
  );
}
