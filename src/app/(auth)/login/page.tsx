import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { googleEnabled } from "@/auth"
import { AuthForm } from "@/components/auth-form"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { getOptionalUser } from "@/server/session"

export default async function LoginPage() {
  if (await getOptionalUser()) redirect("/dashboard")

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4 py-8">
      <Card className="w-full border border-border/80 shadow-hairline">
        <CardHeader className="gap-5 px-6 pb-5 pt-8 text-center sm:px-8">
          <div className="flex flex-col items-center gap-3">
            <Image src="/brand/mark.svg" alt="Mis Pesitos" width={48} height={60} priority className="h-12 w-auto" />
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-paper">Entrar a Mis Pesitos</h1>
              <CardDescription>Tus finanzas, ordenadas.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-6 pb-8 sm:px-8">
          <AuthForm mode="login" googleEnabled={googleEnabled} />
          <p className="text-muted-foreground text-center text-sm">
            ¿No tenés cuenta?{" "}
            <Link href="/registro" className="cursor-pointer font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80">
              Creá una
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
