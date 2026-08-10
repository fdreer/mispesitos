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
    <nav className="mb-8 flex items-center gap-1 overflow-x-auto border-b border-graphite">
      {LINKS.map((link) => {
        const active = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            // La barra activa va como borde inferior de 2px sobre el mismo
            // hairline de la nav, no como un bloque aparte: así no corre el
            // texto un pixel al cambiar de sección.
            className={cn(
              "border-b-2 px-3 py-2 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "border-acid-lime text-paper"
                : "border-transparent text-mist hover:text-paper",
            )}
          >
            {link.label}
          </Link>
        )
      })}
      <span className="ml-auto flex items-center gap-2">
        {error && <span className="text-destructive text-xs">{error}</span>}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={pending}
          className="px-3 py-2 text-[13px] whitespace-nowrap text-fog transition-colors hover:text-paper"
        >
          {pending ? "Saliendo…" : "Salir"}
        </button>
      </span>
    </nav>
  )
}
