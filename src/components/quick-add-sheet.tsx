"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

import { MovementForm } from "@/components/movement-form"
import { MOVEMENT_SHEET_CLASS } from "@/components/movement-form-dialog"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { IsoDate } from "@/lib/dates"
import { defaultQuickAddKind, QUICK_ADD_EVENT } from "@/lib/mobile-nav"
import { loadQuickAddData } from "@/server/actions/quick-add"
import type { CardOption, DescriptionSuggestion } from "@/server/card-queries"
import type { Category } from "@/server/queries"

export type QuickAddData = {
  expenseCategories: Category[]
  incomeCategories: Category[]
  cards: CardOption[]
  expenseSuggestions: DescriptionSuggestion[]
  incomeSuggestions: DescriptionSuggestion[]
  today: IsoDate
}

/**
 * El alta rápida del botón "+" móvil. Se abre con el evento global
 * (`openQuickAddSheet`) y recién ahí pide sus catálogos: la primera vez
 * muestra un esqueleto; las siguientes, lo que ya tenía mientras lo refresca
 * (así una categoría o tarjeta nueva aparece sin recargar la página).
 */
export function QuickAddSheet() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<"income" | "expense">(() => defaultQuickAddKind(pathname))
  const [data, setData] = useState<QuickAddData | null>(null)
  const [failed, setFailed] = useState(false)
  const loading = useRef(false)

  const refresh = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    setFailed(false)
    try {
      setData(await loadQuickAddData())
    } catch {
      setFailed(true)
    } finally {
      loading.current = false
    }
  }, [])

  useEffect(() => {
    function handleOpen() {
      setKind(defaultQuickAddKind(pathname))
      setOpen(true)
      void refresh()
    }
    window.addEventListener(QUICK_ADD_EVENT, handleOpen)
    return () => window.removeEventListener(QUICK_ADD_EVENT, handleOpen)
  }, [pathname, refresh])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={MOVEMENT_SHEET_CLASS}>
        <div className="shrink-0 px-5 pt-3 sm:px-6 sm:pt-5">
          <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/15 sm:hidden" />
          <DialogHeader className="gap-3">
            <DialogTitle className="text-[15px] font-medium text-paper">{kind === "income" ? "Nuevo ingreso" : "Nuevo egreso"}</DialogTitle>
            <Segmented
              label="Tipo de movimiento"
              value={kind}
              onChange={setKind}
              size="sm"
              options={[
                { value: "expense", label: "Egreso" },
                { value: "income", label: "Ingreso" },
              ]}
            />
          </DialogHeader>
        </div>
        {data ? (
          <MovementForm
            key={kind}
            kind={kind}
            categories={kind === "income" ? data.incomeCategories : data.expenseCategories}
            cards={kind === "expense" ? data.cards : []}
            suggestions={kind === "income" ? data.incomeSuggestions : data.expenseSuggestions}
            today={data.today}
            onSaved={() => setOpen(false)}
          />
        ) : failed ? (
          <div className="space-y-3 px-5 py-6 text-center sm:px-6">
            <p className="text-muted-foreground text-sm">No pudimos cargar el formulario.</p>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <QuickAddSkeleton />
        )}
      </DialogContent>
    </Dialog>
  )
}

function QuickAddSkeleton() {
  return (
    <div className="space-y-4 px-5 py-5 sm:px-6" aria-busy aria-label="Cargando formulario">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-4 w-1/3 animate-pulse rounded bg-graphite" />
          <div className="h-9 w-full animate-pulse rounded-lg bg-white/[0.03]" />
        </div>
      ))}
    </div>
  )
}
