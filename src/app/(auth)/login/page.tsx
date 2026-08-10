import Link from "next/link"
import { redirect } from "next/navigation"

import { googleEnabled } from "@/auth"
import { AuthForm } from "@/components/auth-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getOptionalUser } from "@/server/session"

export default async function LoginPage() {
  if (await getOptionalUser()) redirect("/dashboard")

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Entrar a Mis Pesitos</CardTitle>
          <CardDescription>Tus finanzas, ordenadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="login" googleEnabled={googleEnabled} />
          <p className="text-muted-foreground text-center text-sm">
            ¿No tenés cuenta?{" "}
            <Link href="/registro" className="underline">
              Creá una
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
