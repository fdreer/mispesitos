"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { signIn, signUp } from "@/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AuthForm({
  mode,
  fixedEmail,
  submitLabel,
}: {
  mode: "login" | "registro"
  /**
   * Invitación con correo: sólo esa dirección puede usarla (lo hace cumplir
   * el servidor), así que el campo viene completo y no se edita.
   */
  fixedEmail?: string
  submitLabel?: string
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState(fixedEmail ?? "")
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

  return (
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
            readOnly={Boolean(fixedEmail)}
            aria-readonly={fixedEmail ? true : undefined}
            required
            className="h-11 read-only:opacity-70"
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
          {pending ? "Un segundo…" : (submitLabel ?? (mode === "registro" ? "Crear cuenta" : "Entrar"))}
        </Button>
      </form>
  )
}
