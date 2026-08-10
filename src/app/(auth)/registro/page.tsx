import Link from "next/link"
import { redirect } from "next/navigation"

import { googleEnabled } from "@/auth"
import { AuthForm } from "@/components/auth-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getOptionalUser } from "@/server/session"

export default async function RegistroPage() {
  if (await getOptionalUser()) redirect("/dashboard")

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>Empezá a ordenar tu plata hoy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="registro" googleEnabled={googleEnabled} />
          <p className="text-muted-foreground text-center text-sm">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="underline">
              Entrá
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
