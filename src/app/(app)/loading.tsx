export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-44 animate-pulse rounded-md bg-obsidian" />

      <div className="space-y-3 sm:hidden">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-graphite bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-obsidian" />
                <div className="h-3.5 w-1/2 animate-pulse rounded bg-obsidian" />
              </div>
              <div className="h-5 w-20 shrink-0 animate-pulse rounded bg-obsidian" />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="h-5 w-24 animate-pulse rounded-full bg-obsidian" />
              <div className="h-7 w-16 animate-pulse rounded-md bg-obsidian" />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden space-y-6 sm:block">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-white/[0.03]" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-white/[0.03]" />
      </div>
    </div>
  )
}
