import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getOptionalUser } from "@/server/session"

export default async function HomePage() {
  if (await getOptionalUser()) redirect("/dashboard")

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-semibold">Mis Pesitos</h1>
      <p className="text-muted-foreground text-lg">
        Anotá lo que entra y lo que sale, seguí tus cuotas y mirá cuánta plata te queda
        de verdad. En pesos y en dólares.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/registro">Crear cuenta</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Entrar</Link>
        </Button>
      </div>
    </main>
  )
}
