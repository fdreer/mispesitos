import { redirect } from "next/navigation"

import { SettingsForm } from "@/components/settings-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { todayInAr } from "@/lib/dates"
import { getSettings } from "@/server/queries"
import { requireUser } from "@/server/session"

export default async function OnboardingPage() {
  const user = await requireUser()
  if (await getSettings(user.id)) redirect("/dashboard")

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Empecemos</CardTitle>
          <CardDescription>
            Decinos cuánta plata tenés hoy y desde cuándo contamos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            defaults={{
              initialBalanceArs: "0",
              initialBalanceUsd: "0",
              initialBalanceDate: todayInAr(),
              preferredRate: "blue",
            }}
            redirectTo="/dashboard"
            submitLabel="Listo, empezar"
          />
        </CardContent>
      </Card>
    </main>
  )
}
