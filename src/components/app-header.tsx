"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Fragment, useEffect, useState, useSyncExternalStore } from "react"
import { ChevronLeft, ChevronRight, PanelLeft } from "lucide-react"

import { buildBreadcrumbs } from "@/lib/breadcrumbs"
import { toggleSidebar, useSidebarExpanded } from "@/lib/sidebar-state"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/* Título de página dinámico (p. ej. el nombre de una tarjeta)          */
/* ------------------------------------------------------------------ */

type PageTitleEntry = { pathname: string; title: string } | null

let pageTitle: PageTitleEntry = null
const pageTitleListeners = new Set<() => void>()

function setPageTitle(entry: PageTitleEntry) {
  pageTitle = entry
  pageTitleListeners.forEach((listener) => listener())
}

function subscribePageTitle(listener: () => void) {
  pageTitleListeners.add(listener)
  return () => {
    pageTitleListeners.delete(listener)
  }
}

/**
 * Reemplaza la última miga del header por un título propio de la página
 * (p. ej. el nombre de la tarjeta en `/tarjetas/[id]`). No renderiza nada.
 */
export function PageTitle({ title }: { title: string }) {
  const pathname = usePathname()
  useEffect(() => {
    setPageTitle({ pathname, title })
    return () => setPageTitle(null)
  }, [pathname, title])
  return null
}

/* ------------------------------------------------------------------ */
/* Historial (atrás / adelante)                                         */
/* ------------------------------------------------------------------ */

type NavigationLike = EventTarget & { canGoBack?: boolean; canGoForward?: boolean }

function getNavigation(): NavigationLike | undefined {
  return (window as unknown as { navigation?: NavigationLike }).navigation
}

function useHistoryAvailability(pathname: string) {
  const [state, setState] = useState({ back: true, forward: true })

  useEffect(() => {
    const nav = getNavigation()
    if (!nav || typeof nav.canGoBack !== "boolean") return
    let cancelled = false
    const update = () => {
      if (cancelled) return
      setState({ back: Boolean(nav.canGoBack), forward: Boolean(nav.canGoForward) })
    }
    // Next.js actualiza el historial dentro de un useInsertionEffect y el
    // navegador dispara `currententrychange` de forma síncrona: si hiciéramos
    // setState ahí, React lo rechaza. Se posterga al siguiente microtask.
    const onEntryChange = () => queueMicrotask(update)
    update()
    nav.addEventListener("currententrychange", onEntryChange)
    return () => {
      cancelled = true
      nav.removeEventListener("currententrychange", onEntryChange)
    }
  }, [pathname])

  return state
}

const iconButton =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-fog transition-colors hover:bg-accent/60 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35"

/* ------------------------------------------------------------------ */
/* Header                                                               */
/* ------------------------------------------------------------------ */

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const expanded = useSidebarExpanded()
  const history = useHistoryAvailability(pathname)
  const titleEntry = useSyncExternalStore(
    subscribePageTitle,
    () => pageTitle,
    () => null,
  )

  const crumbs = buildBreadcrumbs(pathname)
  if (titleEntry && titleEntry.pathname === pathname && crumbs.length > 0) {
    crumbs[crumbs.length - 1] = { ...crumbs[crumbs.length - 1], label: titleEntry.title }
  }

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1 border-b border-graphite bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4 lg:px-3">
      <div className="hidden items-center gap-0.5 lg:flex">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-expanded={expanded}
          aria-label={expanded ? "Contraer barra lateral" : "Expandir barra lateral"}
          title={expanded ? "Contraer barra lateral (Ctrl+B)" : "Expandir barra lateral (Ctrl+B)"}
          className={iconButton}
        >
          <PanelLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={!history.back}
          aria-label="Atrás"
          title="Atrás"
          className={iconButton}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => router.forward()}
          disabled={!history.forward}
          aria-label="Adelante"
          title="Adelante"
          className={iconButton}
        >
          <ChevronRight className="size-4" />
        </button>
        <div aria-hidden className="mx-2 h-4 w-px bg-graphite" />
      </div>

      <Link
        href="/dashboard"
        aria-label="Mis Pesitos"
        className="mr-2.5 flex shrink-0 items-center lg:hidden"
      >
        <img src="/brand/mark.svg" alt="" className="h-[22px] w-auto" />
      </Link>

      <nav aria-label="Ubicación" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1
            return (
              <Fragment key={crumb.href}>
                {i > 0 ? (
                  <li aria-hidden className="shrink-0 text-smoke">
                    /
                  </li>
                ) : null}
                <li className={cn("min-w-0", last ? "truncate" : "shrink-0")}>
                  {last ? (
                    <span aria-current="page" className="truncate font-medium text-paper">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="rounded-sm text-fog transition-colors hover:text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              </Fragment>
            )
          })}
        </ol>
      </nav>
    </header>
  )
}
