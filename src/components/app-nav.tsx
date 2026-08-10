"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"

import { signOut } from "@/auth-client"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ingresos", label: "Ingresos" },
  { href: "/egresos", label: "Egresos" },
  { href: "/cambios", label: "Cambios" },
  { href: "/categorias", label: "Categorías" },
  { href: "/ajustes", label: "Ajustes" },
]

export function AppNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setError(null)
    setPending(true)
    const result = await signOut()
    setPending(false)

    if (result.error) {
      setError(result.error.message ?? "No pudimos cerrar la sesión.")
      return
    }

    router.push("/login")
    router.refresh()
  }

  return (
    <nav className="mb-6 flex items-center gap-1 overflow-x-auto border-b pb-2">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm whitespace-nowrap",
            pathname === link.href
              ? "bg-secondary font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
      <span className="ml-auto flex items-center gap-2">
        {error && <span className="text-destructive text-xs">{error}</span>}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
        >
          {pending ? "Saliendo…" : "Salir"}
        </button>
      </span>
    </nav>
  )
}
