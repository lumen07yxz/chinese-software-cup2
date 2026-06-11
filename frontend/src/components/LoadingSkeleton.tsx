/** 骨架屏加载占位 */
export function CardSkeleton() {
  return (
    <div className="p-4 rounded-lg border border-border bg-surface animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded bg-cream flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-cream rounded w-3/4" />
          <div className="h-3 bg-cream rounded w-full" />
          <div className="h-3 bg-cream rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function TextSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 bg-cream rounded w-full" />
      <div className="h-4 bg-cream rounded w-5/6" />
      <div className="h-4 bg-cream rounded w-4/6" />
      <div className="h-3 bg-cream rounded w-3/4 mt-2" />
    </div>
  );
}
