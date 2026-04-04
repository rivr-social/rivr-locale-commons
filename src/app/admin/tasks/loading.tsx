export default function AdminTasksLoading() {
  return (
    <div className="container max-w-4xl mx-auto p-4 pb-20">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-44 bg-muted-foreground/10 rounded animate-pulse" />
        <div className="h-4 w-56 bg-muted-foreground/10 rounded animate-pulse" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 mb-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-muted-foreground/10 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-40 bg-muted-foreground/10 rounded animate-pulse" />
              <div className="h-4 w-28 bg-muted-foreground/10 rounded animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
