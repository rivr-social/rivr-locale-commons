export default function AdminBadgesLoading() {
  return (
    <div className="container max-w-6xl mx-auto p-4 pb-20">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-52 bg-muted-foreground/10 rounded animate-pulse" />
        <div className="h-4 w-40 bg-muted-foreground/10 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="h-5 w-32 bg-muted-foreground/10 rounded animate-pulse" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-10 w-full bg-muted-foreground/10 rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
