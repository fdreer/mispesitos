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

  return (
    <div className="space-y-4">
      {googleEnabled && (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signIn.social({ provider: "google", callbackURL: "/dashboard" })}
          >
            Continuar con Google
          </Button>

          <div className="text-muted-foreground text-center text-sm">o</div>
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === "registro" && (
          <div className="space-y-1">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "registro" ? "new-password" : "current-password"}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Un segundo…" : mode === "registro" ? "Crear cuenta" : "Entrar"}
        </Button>
      </form>
    </div>
  )
}
