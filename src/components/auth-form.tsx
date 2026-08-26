"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { signIn, signUp } from "@/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AuthForm({
  mode,
  googleEnabled,
}: {
  mode: "login" | "registro"
  googleEnabled: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const result =
      mode === "registro"
        ? await signUp.email({ name, email, password })
        : await signIn.email({ email, password })

    setPending(false)

    if (result.error) {
      setError(result.error.message ?? "No pudimos completar la operación.")
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  /**
   * Mismo trato que el formulario de correo: la promesa se espera y el
   * resultado se mira. Era el único `onClick` de la app que descartaba lo que
   * devolvía —y encima el camino que no está verificado, por falta de
   * credenciales—, así que si Google fallaba el botón no hacía absolutamente
   * nada y el usuario no veía ni un mensaje.
   *
   * Cuando sale bien, better-auth se lleva el navegador a Google y esta página
   * deja de existir: el `setPending(false)` sólo llega a correr en el camino
   * de error, y no molesta si no.
   */
  async function onGoogle() {
    setError(null)
    setPending(true)

    const result = await signIn.social({ provider: "google", callbackURL: "/dashboard" })

    setPending(false)

    if (result.error) {
      setError(result.error.message ?? "No pudimos entrar con Google.")
    }
  }

  return (
    <div className="space-y-4">
      {googleEnabled && (
        <>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full gap-3 px-4"
            disabled={pending}
            onClick={onGoogle}
          >
            <svg aria-hidden="true" className="size-[18px]" viewBox="0 0 18 18" focusable="false">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.56 2.69-3.86 2.69-6.62Z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.82.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18Z" />
              <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.82.94 4.03l3.01-2.33Z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.57-2.57C13.47.9 11.43 0 9 0A9 9 0 0 0 .94 4.97l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
            </svg>
            Continuar con Google
          </Button>

          <div className="flex items-center gap-3 text-muted-foreground text-xs uppercase tracking-[0.12em]">
            <span className="h-px flex-1 bg-border" />
            <span>o</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "registro" && (
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required className="h-11" />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "registro" ? "new-password" : "current-password"}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="mt-2 h-11 w-full" disabled={pending}>
          {pending ? "Un segundo…" : mode === "registro" ? "Crear cuenta" : "Entrar"}
        </Button>
      </form>
    </div>
  )
}
