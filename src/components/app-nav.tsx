"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

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

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b pb-2">
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
    </nav>
  )
}
