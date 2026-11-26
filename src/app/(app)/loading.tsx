/**
 * Esqueleto de cualquier pantalla de la app mientras el servidor trae sus
 * datos. En móvil (`< sm`) muestra esqueletos con forma de tarjeta coherentes
 * con las vistas de movimientos, tarjetas y cambios (§5.3 y §6 del plan v2);
 * en escritorio mantiene la grilla genérica.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-44 animate-pulse rounded-md bg-obsidian" />

      {/* Móvil: tarjetas apiladas con encabezado, subtítulo y monto a la derecha. */}
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

      {/* Escritorio: tarjetas de resumen + bloque principal. */}
      <div className="hidden space-y-6 sm:block">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-graphite" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-graphite" />
      </div>
    </div>
  )
}
