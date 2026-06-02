export function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse bg-dark-border rounded-xl ${className}`} />
  )
}

export function ExpenseCardSkeleton() {
  return (
    <div className="card p-4 flex items-center gap-3 mb-2.5">
      <Skeleton className="w-11 h-11 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  )
}

export function StatCardSkeleton() {
  return <Skeleton className="h-24 w-full rounded-2xl" />
}
