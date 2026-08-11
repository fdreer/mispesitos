import { Suspense } from "react"

import { CategoryManager } from "@/components/category-manager"
import { listCategories } from "@/server/queries"
import { requireSettings } from "@/server/session"

/**
 * Las dos tarjetas. Van detrás de un Suspense para que el título salga en el
 * primer flush, igual que en el resto de las pantallas; acá la consulta es
 * chica, así que la espera es corta — pero la alternativa era el esqueleto
 * genérico de `(app)/loading.tsx`, que promete cuatro tarjetas en fila y un
 * bloque grande, o sea la forma equivocada.
 *
 * Un solo límite y no uno por tarjeta: las dos salen de la MISMA consulta
 * (una sola lista, partida por `kind` acá abajo), así que dos límites
 * esperarían exactamente lo mismo.
 */
async function CategoriasBody() {
  const { user } = await requireSettings()
  // Con las archivadas incluidas: ésta es la pantalla para la que existe el
  // tercer parámetro de listCategories. Sin él, archivar hacía desaparecer la
  // fila y la categoría no volvía a verse desde ningún lado.
  const categories = await listCategories(user.id, undefined, true)

  return (
    <>
      <CategoryManager kind="income" categories={categories.filter((c) => c.kind === "income")} />
      <CategoryManager kind="expense" categories={categories.filter((c) => c.kind === "expense")} />
    </>
  )
}

/**
 * Las mismas dos tarjetas, en gris. Sin div envolvente propio: así los dos
 * huecos son hijos directos del mismo `space-y-4` que después van a ocupar
 * las tarjetas de verdad, y el espacio entre ellas no cambia al llegar.
 */
function CategoriasSkeleton() {
  return (
    <>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden
          className="h-[248px] animate-pulse rounded-xl border border-border"
        />
      ))}
    </>
  )
}

/**
 * `max-w-2xl` y no el ancho completo: acá todo lo que se lee son nombres de
 * categoría y un botón al lado. Estirado a 1200px, cada fila dejaba medio
 * metro de vacío entre el nombre y su propio botón "Archivar", que es
 * justamente el par que hay que leer junto.
 *
 * `space-y-4` entre las dos tarjetas (no el `space-y-8` de antes): con la
 * tarjeta puesta, el borde ya separa los dos bloques y no hace falta que
 * además los separe el aire.
 */
export default function CategoriasPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-paper">Categorías</h1>

      <div className="space-y-4">
        <Suspense fallback={<CategoriasSkeleton />}>
          <CategoriasBody />
        </Suspense>
      </div>
    </div>
  )
}
