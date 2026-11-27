"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings,
  Tags,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { signOut } from "@/auth-client"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { isMoreMenuActive, isRouteActive, openQuickAddSheet } from "@/lib/mobile-nav"
import { toggleSidebar, useSidebarExpanded } from "@/lib/sidebar-state"
import { cn } from "@/lib/utils"

const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/ingresos", label: "Ingresos", icon: TrendingUp },
      { href: "/egresos", label: "Egresos", icon: TrendingDown },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { href: "/tarjetas", label: "Tarjetas", icon: CreditCard },
      { href: "/cambios", label: "Cambios", icon: ArrowLeftRight },
      { href: "/informes", label: "Informes", icon: BarChart3 },
    ],
  },
  {
    label: "Configuración",
    items: [
      { href: "/categorias", label: "Categorías", icon: Tags },
      { href: "/ajustes", label: "Ajustes", icon: Settings },
    ],
  },
] as const

const MORE_LINKS = [
  { href: "/tarjetas", label: "Tarjetas", icon: CreditCard },
  { href: "/informes", label: "Informes", icon: BarChart3 },
  { href: "/cambios", label: "Cambios", icon: ArrowLeftRight },
  { href: "/categorias", label: "Categorías", icon: Tags },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
]

function MobileBrand() {
  return (
    <div className="flex items-center gap-2 overflow-hidden">
      <img src="/brand/mark.svg" alt="Mis Pesitos" className="h-7 w-auto shrink-0" />
      <span className="font-heading text-sm font-medium text-paper">Mis Pesitos</span>
    </div>
  )
}

function DesktopNavLinks({
  pathname,
  expanded,
}: {
  pathname: string
  expanded: boolean
}) {
  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-4 px-2">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} role="group" aria-label={group.label} className="flex flex-col gap-px">
          {group.items.map((link) => {
            const active = isRouteActive(pathname, link.href)
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                title={expanded ? undefined : link.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-8 items-center gap-2.5 overflow-hidden rounded-md px-[11px] text-[13px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-accent font-medium text-paper"
                    : "text-fog hover:bg-accent/50 hover:text-mist",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    active ? "text-paper" : "text-fog group-hover:text-mist",
                  )}
                />
                <span
                  className={cn(
                    "truncate transition-opacity duration-200 ease-out",
                    expanded ? "opacity-100 delay-75" : "opacity-0",
                  )}
                >
                  {link.label}
                </span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

type Props = {
  onQuickAdd?: () => void
}

export function AppSidebar({ onQuickAdd }: Props = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const expanded = useSidebarExpanded()

  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setMoreOpen(false)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
          return
        }
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  async function handleSignOut() {
    setPending(true)
    const result = await signOut()
    setPending(false)
    if (result.error) return
    setMoreOpen(false)
    router.push("/login")
    router.refresh()
  }

  const salir = pending ? "Saliendo…" : "Salir"
  const cerrarSesion = pending ? "Saliendo…" : "Cerrar sesión"
  const moreActive = isMoreMenuActive(pathname)

  function handleQuickAdd() {
    if (onQuickAdd) {
      onQuickAdd()
    } else {
      openQuickAddSheet()
    }
  }

  return (
    <>
      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-graphite bg-carbon/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-1">
          <Link
            href="/dashboard"
            aria-current={isRouteActive(pathname, "/dashboard") ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
              isRouteActive(pathname, "/dashboard") ? "text-paper" : "text-fog hover:text-mist",
            )}
          >
            <LayoutDashboard className="size-5 shrink-0" />
            <span>Inicio</span>
          </Link>

          <Link
            href="/egresos"
            aria-current={isRouteActive(pathname, "/egresos") ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
              isRouteActive(pathname, "/egresos") ? "text-paper" : "text-fog hover:text-mist",
            )}
          >
            <TrendingDown className="size-5 shrink-0" />
            <span>Egresos</span>
          </Link>

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleQuickAdd}
              aria-label="Cargar movimiento"
              className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-5 stroke-[2.25]" />
            </button>
          </div>

          <Link
            href="/ingresos"
            aria-current={isRouteActive(pathname, "/ingresos") ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
              isRouteActive(pathname, "/ingresos") ? "text-paper" : "text-fog hover:text-mist",
            )}
          >
            <TrendingUp className="size-5 shrink-0" />
            <span>Ingresos</span>
          </Link>

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-expanded={moreOpen}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
                  moreActive || moreOpen ? "text-paper" : "text-fog hover:text-mist",
                )}
              >
                <MoreHorizontal className="size-5 shrink-0" />
                <span>Más</span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="gap-0 rounded-t-2xl border-t border-graphite bg-carbon p-0 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            >
              <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-smoke" />
              <SheetHeader className="border-b border-graphite px-4 py-3">
                <SheetTitle className="flex items-center gap-2 text-sm">
                  <MobileBrand />
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Otras secciones y opciones de cuenta
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-0.5 p-2">
                {MORE_LINKS.map((link) => {
                  const active = isRouteActive(pathname, link.href)
                  const Icon = link.icon
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                        active
                          ? "bg-accent text-paper"
                          : "text-mist hover:bg-accent/50 hover:text-paper",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{link.label}</span>
                    </Link>
                  )
                })}
                <div className="my-1.5 border-t border-graphite" />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSignOut}
                  disabled={pending}
                  className="h-11 w-full justify-start gap-3 px-3 text-sm text-fog hover:text-paper"
                >
                  <LogOut className="size-4 shrink-0" />
                  {salir}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      <aside
        data-expanded={expanded}
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 self-start flex-col overflow-hidden border-r border-graphite bg-carbon transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] lg:flex",
          expanded ? "w-56" : "w-14",
        )}
      >
        <div className="flex h-12 shrink-0 items-center px-2">
          <Link
            href="/dashboard"
            title={expanded ? undefined : "Mis Pesitos"}
            className="flex h-8 min-w-0 items-center gap-2.5 overflow-hidden rounded-md px-2 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src="/brand/mark.svg" alt="Mis Pesitos" className="h-[22px] w-auto shrink-0" />
            <span
              aria-hidden={!expanded}
              className={cn(
                "truncate font-heading text-sm font-semibold tracking-tight whitespace-nowrap text-paper transition-opacity duration-200 ease-out",
                expanded ? "opacity-100 delay-75" : "pointer-events-none opacity-0",
              )}
            >
              Mis Pesitos
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-x-hidden overflow-y-auto pt-2 pb-3">
          <DesktopNavLinks pathname={pathname} expanded={expanded} />
        </div>

        <div className="shrink-0 p-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleSignOut}
            disabled={pending}
            title={expanded ? undefined : cerrarSesion}
            aria-label={cerrarSesion}
            className="h-8 w-full justify-start gap-2.5 overflow-hidden rounded-md px-[11px] text-[13px] font-normal whitespace-nowrap text-fog transition-colors hover:bg-coral-red/10 hover:text-coral-red"
          >
            <LogOut className="size-4 shrink-0" />
            <span
              className={cn(
                "truncate transition-opacity duration-200 ease-out",
                expanded ? "opacity-100 delay-75" : "opacity-0",
              )}
            >
              {cerrarSesion}
            </span>
          </Button>
        </div>
      </aside>
    </>
  )
}
