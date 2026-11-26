import { Suspense } from "react"
import Link from "next/link"
import { ChevronRight, Users } from "lucide-react"

import { SettingsForm } from "@/components/settings-form"
import { Card, CardContent } from "@/components/ui/card"
import { getUserRole } from "@/server/access"
import { requireSettings, requireUser } from "@/server/session"

/** Sólo para el admin: el acceso a la pantalla de usuarios e invitaciones. */
async function UsuariosLink() {
  const user = await requireUser()
  if ((await getUserRole(user.id)) !== "admin") return null

  return (
    <Link href="/ajustes/usuarios" className="block">
      <Card size="sm" className="transition-colors hover:bg-muted/40">
        <CardContent className="flex items-center gap-3">
          <Users className="size-5 text-muted-foreground" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-medium text-paper">Usuarios</p>
            <p className="text-xs text-muted-foreground">Invitá gente y manejá quién tiene acceso.</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </CardContent>
      </Card>
    </Link>
  )
}

/**
 * El formulario, con los valores guardados adentro. Detrás de un Suspense por
 * la misma razón que el resto de las pantallas: el título no depende de la
 * base y no tiene por qué esperarla.
 *
 * Es la pantalla que menos gana de las seis —una sola lectura de sesión y
 * ajustes, sin ninguna consulta cara— pero el esqueleto genérico de
 * `(app)/loading.tsx` prometía cuatro tarjetas en fila para un formulario de
 * una columna, que es peor que no prometer nada.
 */
async function AjustesBody() {
  const { settings } = await requireSettings()

  return (
    <SettingsForm
      defaults={{
        initialBalanceArs: String(settings.initialBalanceArsCents / 100),
        initialBalanceUsd: String(settings.initialBalanceUsdCents / 100),
        // `numeric` en Postgres llega como string por Drizzle: se pasa tal
        // cual, sin pasar por Number(), para no arriesgar precisión de más
        // por un ida y vuelta que no hace falta (ver src/db/schema.ts).
        initialBalanceUsdRate: settings.initialBalanceUsdRate,
        initialBalanceDate: settings.initialBalanceDate,
        preferredRate: settings.preferredRate,
      }}
      submitLabel="Guardar cambios"
    />
  )
}

/** El mismo formulario, en gris: cinco campos con su etiqueta y el botón. */
function AjustesSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-4 w-2/3 animate-pulse rounded bg-graphite" />
          <div className="h-8 w-full animate-pulse rounded-lg border border-input" />
        </div>
      ))}
      <div className="h-8 w-full animate-pulse rounded-lg bg-graphite" />
    </div>
  )
}

/**
 * `max-w-md` y no el `max-w-sm` de antes: con 384px, la etiqueta más larga
 * ("¿A qué tipo de cambio promedio los compraste?") se partía en tres
 * renglones y el formulario quedaba más alto de etiquetas que de campos.
 * Adentro de una tarjeta, como el resto de los formularios de la app.
 */
export default function AjustesPage() {
  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-paper">Ajustes</h1>

      <Card size="sm">
        <CardContent>
          <Suspense fallback={<AjustesSkeleton />}>
            <AjustesBody />
          </Suspense>
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        <UsuariosLink />
      </Suspense>
    </div>
  )
}
