export default function AdminGraphLoading() {
  return (
    <div className="container max-w-6xl mx-auto p-4 pb-20">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-36 bg-muted-foreground/10 rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted-foreground/10 rounded animate-pulse" />
      </div>
      <div className="rounded-lg border bg-card p-6">
        <div className="h-5 w-28 bg-muted-foreground/10 rounded animate-pulse mb-4" />
        <div className="h-[500px] w-full bg-muted-foreground/10 rounded animate-pulse" />
      </div>
    </div>
  )
}
