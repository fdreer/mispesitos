import { SettingsForm } from "@/components/settings-form"
import { requireSettings } from "@/server/session"

export default async function AjustesPage() {
  const { settings } = await requireSettings()

  return (
    <div className="max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
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
    </div>
  )
}
