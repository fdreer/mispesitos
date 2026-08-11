"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowLeftRight,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Settings,
  Tags,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { signOut } from "@/auth-client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ingresos", label: "Ingresos", icon: TrendingUp },
  { href: "/egresos", label: "Egresos", icon: TrendingDown },
  { href: "/cambios", label: "Cambios", icon: ArrowLeftRight },
  { href: "/categorias", label: "Categorías", icon: Tags },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [pending, setPending] = useState(false)

  function toggle() {
    setCollapsed((prev) => !prev)
  }

  async function handleSignOut() {
    setPending(true)
    const result = await signOut()
    setPending(false)
    if (result.error) return
    router.push("/login")
    router.refresh()
  }

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col self-start overflow-hidden border-r border-graphite bg-carbon transition-[width] duration-200 ease-in-out",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className={cn("flex items-center px-2 py-4", collapsed ? "justify-center" : "justify-end")}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          <span className="sr-only">{collapsed ? "Expandir menú" : "Colapsar menú"}</span>
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {LINKS.map((link) => {
          const active = pathname === link.href
          const Icon = link.icon
          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-accent text-paper"
                  : "text-mist hover:bg-accent/50 hover:text-paper",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span
                className={cn(
                  "overflow-hidden transition-all duration-200 ease-in-out",
                  collapsed ? "max-w-0 opacity-0" : "max-w-32 opacity-100",
                )}
              >
                {link.label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="px-2 pb-4">
        <Button
          type="button"
          variant="ghost"
          onClick={handleSignOut}
          disabled={pending}
          title={collapsed ? "Salir" : undefined}
          className={cn("w-full text-fog", collapsed ? "justify-center px-0" : "justify-start gap-2.5")}
        >
          <LogOut className="size-4 shrink-0" />
          <span
            className={cn(
              "overflow-hidden transition-all duration-200 ease-in-out",
              collapsed ? "max-w-0 opacity-0" : "max-w-32 opacity-100",
            )}
          >
            {pending ? "Saliendo…" : "Salir"}
          </span>
        </Button>
      </div>
    </aside>
  )
}
