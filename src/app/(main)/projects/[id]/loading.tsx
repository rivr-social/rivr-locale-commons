/**
 * Loading skeleton for the project detail page.
 */
export default function ProjectLoading() {
  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="h-4 w-28 bg-muted-foreground/10 rounded animate-pulse" />
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-7 w-64 bg-muted-foreground/10 rounded animate-pulse" />
            <div className="h-4 w-96 bg-muted-foreground/10 rounded animate-pulse" />
          </div>
          <div className="h-6 w-16 bg-muted-foreground/10 rounded-full animate-pulse" />
        </div>
        <div className="h-2 w-full bg-muted-foreground/10 rounded animate-pulse" />
        <div className="flex gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 w-24 bg-muted-foreground/10 rounded animate-pulse" />
          ))}
        </div>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <div className="h-5 w-28 bg-muted-foreground/10 rounded animate-pulse mb-4" />
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted-foreground/10 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted-foreground/10 rounded animate-pulse" />
            <div className="h-3 w-20 bg-muted-foreground/10 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
