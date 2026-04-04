/**
 * Admin loading skeleton displayed while admin dashboard data is being fetched.
 */
export default function AdminLoading() {
  return (
    <div className="container max-w-6xl mx-auto p-4 pb-20">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-48 bg-muted-foreground/10 rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted-foreground/10 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-8 w-16 bg-muted-foreground/10 rounded animate-pulse" />
                <div className="h-4 w-32 bg-muted-foreground/10 rounded animate-pulse" />
              </div>
              <div className="h-12 w-12 bg-muted-foreground/10 rounded-full animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
