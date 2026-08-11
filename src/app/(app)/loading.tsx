/**
 * Esqueleto de cualquier pantalla de la app mientras el servidor trae sus
 * datos. No imita la grilla de ninguna en particular a propósito: las seis
 * tienen layouts distintos y un esqueleto que promete la forma equivocada es
 * peor que uno genérico.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-md bg-obsidian" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-graphite" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-graphite" />
    </div>
  )
}
