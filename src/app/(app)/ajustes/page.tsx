import { Suspense } from "react"
import Link from "next/link"
import { ChevronRight, Users } from "lucide-react"

import { SettingsForm } from "@/components/settings-form"
import { Card, CardContent } from "@/components/ui/card"
import { getUserRole } from "@/server/access"
import { requireSettings, requireUser } from "@/server/session"

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

async function AjustesBody() {
  const { settings } = await requireSettings()

  return (
    <SettingsForm
      defaults={{
        initialBalanceArs: String(settings.initialBalanceArsCents / 100),
        initialBalanceUsd: String(settings.initialBalanceUsdCents / 100),
        initialBalanceDate: settings.initialBalanceDate,
        preferredRate: settings.preferredRate,
      }}
      submitLabel="Guardar cambios"
    />
  )
}

function AjustesSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-4 w-2/3 animate-pulse rounded bg-graphite" />
          <div className="h-8 w-full animate-pulse rounded-lg bg-white/[0.03]" />
        </div>
      ))}
      <div className="h-8 w-full animate-pulse rounded-lg bg-graphite" />
    </div>
  )
}

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
