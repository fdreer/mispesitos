"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowLeftRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Tags,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { signOut } from "@/auth-client"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ingresos", label: "Ingresos", icon: TrendingUp },
  { href: "/egresos", label: "Egresos", icon: TrendingDown },
  { href: "/tarjetas", label: "Tarjetas", icon: CreditCard },
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

/** Lo mismo, pero siempre abierto: el drawer de mobile no se contrae nunca. */
const FULL_ITEM = "justify-start gap-2.5 px-2.5"
const FULL_LABEL = "max-w-32 opacity-100"

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

/**
 * Los links de navegación, compartidos entre el riel de escritorio y el drawer
 * de mobile: mismo orden, mismos íconos, mismo estado activo.
 *
 * `rail` elige entre las dos formas. En el drawer, `onNavigate` cierra el
 * Sheet: un `Link` no dispara el `onOpenChange` de Radix, así que sin eso el
 * drawer se quedaría abierto tapando la pantalla nueva.
 *
 * La etiqueta se recorta con `max-w-0` y `overflow-hidden`, no con `hidden`:
 * sigue en el árbol de accesibilidad, así que cada ícono conserva su nombre
 * aunque el riel esté contraído.
 */
function NavLinks({
  pathname,
  rail,
  onNavigate,
}: {
  pathname: string
  rail: boolean
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-2">
      {LINKS.map((link) => {
        const active = pathname === link.href
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
              onNavigate?.()
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              ITEM_BASE,
              rail ? cn(RAIL_COLLAPSED, RAIL_EXPANDED) : FULL_ITEM,
              active ? "bg-accent text-paper" : "text-mist hover:bg-accent/50 hover:text-paper",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className={rail ? RAIL_LABEL : FULL_LABEL}>{link.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Cierra el drawer al cambiar de pantalla (además del cierre por click en un
  // link, ver NavLinks): cubre volver atrás/adelante con el navegador, que
  // tampoco pasa por `onNavigate`. Ajuste de estado durante el render
  // comparando contra el último valor aplicado, igual que `movement-form.tsx`:
  // es el patrón que recomienda React para "resetear estado cuando cambia una
  // entrada", y evita el render en cascada de hacerlo en un `useEffect`.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setMobileOpen(false)
  }

  async function handleSignOut() {
    setPending(true)
    const result = await signOut()
    setPending(false)
    if (result.error) return
    router.push("/login")
    router.refresh()
  }

  const salir = pending ? "Saliendo…" : "Salir"

  return (
    <>
      {/* Barra mobile: reemplaza al riel por debajo de `lg`, donde 224px de
          ancho fijo no dejaban lugar para el contenido (con 375px de viewport,
          apenas 151px libres). */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-graphite bg-carbon px-4 py-3 lg:hidden">
        <Brand rail={false} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm">
              <Menu />
              <span className="sr-only">Abrir menú</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 gap-0 bg-carbon p-0">
            <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
            <div className="flex h-full flex-col py-4">
              <NavLinks pathname={pathname} rail={false} onNavigate={() => setMobileOpen(false)} />
              <div className="px-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSignOut}
                  disabled={pending}
                  className={cn("w-full text-fog", FULL_ITEM)}
                >
                  <LogOut className="size-4 shrink-0" />
                  {salir}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>

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
            <NavLinks pathname={pathname} rail />
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
