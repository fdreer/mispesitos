"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
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
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ingresos", label: "Ingresos", icon: TrendingUp },
  { href: "/egresos", label: "Egresos", icon: TrendingDown },
  { href: "/tarjetas", label: "Tarjetas", icon: CreditCard },
  { href: "/informes", label: "Informes", icon: BarChart3 },
  { href: "/cambios", label: "Cambios", icon: ArrowLeftRight },
  { href: "/categorias", label: "Categorías", icon: Tags },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
]

/** Rutas que se abren desde "Más" en la barra inferior móvil (§5.4 y §7.6). */
const MORE_LINKS = [
  { href: "/tarjetas", label: "Tarjetas", icon: CreditCard },
  { href: "/informes", label: "Informes", icon: BarChart3 },
  { href: "/cambios", label: "Cambios", icon: ArrowLeftRight },
  { href: "/categorias", label: "Categorías", icon: Tags },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
]

/**
 * El riel de escritorio se expande solo con el cursor encima, así que no hay
 * estado de React que lo maneje: la expansión es CSS puro colgada del `group`
 * del riel. Estas constantes son las dos mitades de ese comportamiento.
 *
 * `gap-0` cuando está contraído no es un detalle: con `gap-2.5` puesto, la
 * separación se sigue midiendo entre el ícono y la etiqueta —que mide cero de
 * ancho pero existe— así que empujaba cada ícono 5px a la izquierda del centro
 * del riel. Era la razón por la que los íconos se veían corridos.
 *
 * `focus-within` además del `hover`: con el teclado no hay cursor, y un riel
 * que sólo reacciona al mouse deja a quien tabula navegando entre íconos sin
 * etiqueta visible.
 */
const RAIL_COLLAPSED = "justify-center gap-0 px-0"
const RAIL_EXPANDED = cn(
  "group-hover/rail:justify-start group-hover/rail:gap-2.5 group-hover/rail:px-2.5",
  "group-focus-within/rail:justify-start group-focus-within/rail:gap-2.5 group-focus-within/rail:px-2.5",
)
const RAIL_LABEL = cn(
  "max-w-0 overflow-hidden opacity-0 transition-all duration-200 ease-in-out",
  "group-hover/rail:max-w-32 group-hover/rail:opacity-100",
  "group-focus-within/rail:max-w-32 group-focus-within/rail:opacity-100",
)

const ITEM_BASE =
  "flex items-center rounded-lg py-2 text-[13px] whitespace-nowrap transition-all"

function Brand({ rail }: { rail: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center overflow-hidden transition-all",
        rail ? cn("h-14 border-b border-graphite", RAIL_COLLAPSED, RAIL_EXPANDED) : "gap-2",
      )}
    >
      <img src="/brand/mark.svg" alt="Mis Pesitos" className="h-8 w-auto shrink-0" />
      <span className={rail ? RAIL_LABEL : "font-heading text-sm font-medium text-paper"}>Mis Pesitos</span>
    </div>
  )
}

function DesktopNavLinks({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-0.5 px-2">
      {LINKS.map((link) => {
        const active = isRouteActive(pathname, link.href)
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            /*
             * Un click en Chromium deja el link enfocado, y la navegación de
             * Next no lo saca: sin este blur, `focus-within:w-56` se queda
             * prendido para siempre después del primer click, y el riel no
             * se contrae más aunque el cursor se vaya.
             */
            onClick={(e) => {
              e.currentTarget.blur()
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              ITEM_BASE,
              RAIL_COLLAPSED,
              RAIL_EXPANDED,
              active ? "bg-accent text-paper" : "text-mist hover:bg-accent/50 hover:text-paper",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className={RAIL_LABEL}>{link.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

type Props = {
  /** Callback opcional para tests; en producción dispara el evento de QuickAddSheet. */
  onQuickAdd?: () => void
}

export function AppSidebar({ onQuickAdd }: Props = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  // Cierra la hoja "Más" al cambiar de pantalla (incluye volver atrás/adelante
  // con el navegador). Ajuste de estado durante el render comparando contra el
  // último pathname, igual que `movement-form.tsx`.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setMoreOpen(false)
  }

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
      {/*
        Barra de navegación inferior fija en móvil (§5.4 y decisión §7.6):
        Inicio · Egresos · + · Ingresos · Más.
        La sidebar queda sólo en escritorio (`lg:block`). El botón central "+"
        inicia la carga rápida sin solaparse con tablas ni gráficos.
      */}
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
                  <Brand rail={false} />
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

      {/*
        El riel de escritorio. El <aside> ocupa SIEMPRE 56px en el flujo y el
        panel de adentro va absoluto encima: así, al expandirse, se monta sobre
        el contenido en vez de correrlo. Un riel que empuja la página reflowea
        la tabla entera cada vez que el cursor lo roza de paso.

        Ya no hay botón de colapsar: el ancho lo decide el cursor (o el foco).

        `isolate` en el propio <aside>, no sólo `z-30` en el panel de adentro:
        así el riel forma su propio contexto de apilamiento pase lo que pase
        arriba, y ningún elemento de página (cards, gráficos, lo que sea)
        puede terminar pintándose por encima de él.
      */}
      <aside className="sticky top-0 z-30 isolate hidden h-screen w-14 shrink-0 self-start lg:block">
        <div
          className={cn(
            "group/rail absolute inset-y-0 left-0 z-30 flex w-14 flex-col overflow-hidden",
            "border-r border-graphite bg-carbon transition-[width] duration-200 ease-in-out",
            "hover:w-56 hover:shadow-xl focus-within:w-56 focus-within:shadow-xl",
          )}
        >
          <Brand rail />
          <div className="flex-1 pt-3">
            <DesktopNavLinks pathname={pathname} />
          </div>

          <div className="px-2 pb-4">
            <Button
              type="button"
              variant="ghost"
              onClick={(e) => {
                e.currentTarget.blur()
                handleSignOut()
              }}
              disabled={pending}
              className={cn("w-full text-fog", RAIL_COLLAPSED, RAIL_EXPANDED)}
            >
              <LogOut className="size-4 shrink-0" />
              <span className={RAIL_LABEL}>{salir}</span>
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}
