import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getOptionalUser } from "@/server/session"

export default async function HomePage() {
  if (await getOptionalUser()) redirect("/dashboard")

  return (
    <div className="min-h-dvh">
      {/* Nav pública: wordmark a la izquierda, entrar y la píldora a la
          derecha. Los 1200px son el ancho de página del sistema. */}
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
        <span className="text-base font-medium text-paper">Mis Pesitos</span>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="px-3 py-2 text-[13px] text-mist transition-colors hover:text-paper"
          >
            Entrar
          </Link>
          <Button asChild variant="pill">
            <Link href="/registro">Crear cuenta</Link>
          </Button>
        </nav>
      </header>

      {/* El gap de sección de 96px del sistema vive acá y sólo acá: adentro de
          la app la escalera es 8/12/24. */}
      <main className="mx-auto max-w-[1200px] px-6 pt-24 pb-24">
        <h1 className="max-w-3xl text-hero font-medium text-paper">
          Tu plata, en pesos y en dólares.
        </h1>
        <p className="mt-6 max-w-xl text-base text-fog">
          Anotá lo que entra y lo que sale, seguí tus cuotas y mirá cuánta plata te queda
          de verdad.
        </p>
        <div className="mt-10 flex items-center gap-6">
          <Button asChild size="lg">
            <Link href="/registro">Crear cuenta</Link>
          </Button>
          {/* El link secundario con glifo de flecha, en vez de un segundo botón
              del mismo peso: el sistema admite una sola acción por vista. */}
          <Link
            href="/login"
            className="text-[13px] text-mist transition-colors hover:text-paper"
          >
            Ya tengo cuenta →
          </Link>
        </div>
      </main>
    </div>
  )
}
