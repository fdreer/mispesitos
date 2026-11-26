"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

import { MovementForm } from "@/components/movement-form"
import { Segmented } from "@/components/segmented"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { IsoDate } from "@/lib/dates"
import { defaultQuickAddKind, QUICK_ADD_EVENT } from "@/lib/mobile-nav"
import type { CardOption, DescriptionSuggestion } from "@/server/card-queries"
import type { Category } from "@/server/queries"

export type QuickAddData = {
  expenseCategories: Category[]
  incomeCategories: Category[]
  cards: CardOption[]
  expenseSuggestions: DescriptionSuggestion[]
  incomeSuggestions: DescriptionSuggestion[]
  suggestedRate: number | null
  today: IsoDate
}

type Props = QuickAddData & {
  /** Control externo opcional (usado en tests). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Hoja inferior casi a pantalla completa para carga rápida desde el botón "+"
 * de la barra de navegación móvil (§5.4 del plan v2).
 *
 * Permite alternar entre Egreso e Ingreso arriba sin salir de la pantalla
 * actual, arrancando en Ingreso cuando se abre desde `/ingresos` y en Egreso
 * en el resto de la app.
 */
export function QuickAddSheet({
  expenseCategories,
  incomeCategories,
  cards,
  expenseSuggestions,
  incomeSuggestions,
  suggestedRate,
  today,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const pathname = usePathname()
  const [ownOpen, setOwnOpen] = useState(false)
  const [kind, setKind] = useState<"income" | "expense">(() => defaultQuickAddKind(pathname))

  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : ownOpen
  const setOpen = controlled ? (onOpenChange ?? (() => {})) : setOwnOpen

  useEffect(() => {
    if (controlled) return
    function handleOpen() {
      setKind(defaultQuickAddKind(pathname))
      setOwnOpen(true)
    }
    window.addEventListener(QUICK_ADD_EVENT, handleOpen)
    return () => window.removeEventListener(QUICK_ADD_EVENT, handleOpen)
  }, [controlled, pathname])

  const categories = kind === "income" ? incomeCategories : expenseCategories
  const suggestions = kind === "income" ? incomeSuggestions : expenseSuggestions

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto overscroll-contain rounded-t-2xl rounded-b-none border-t border-graphite pb-[calc(1rem+env(safe-area-inset-bottom))] sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border-0 sm:pb-4">
        <div aria-hidden className="mx-auto -mt-1 mb-1 h-1 w-10 rounded-full bg-smoke sm:hidden" />
        <DialogHeader className="gap-3">
          <DialogTitle>{kind === "income" ? "Nuevo ingreso" : "Nuevo egreso"}</DialogTitle>
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
        {/* `key={kind}` reinicia el formulario al alternar entre egreso e ingreso
            para que las categorías, sugerencias y cuotas correspondan al tipo elegido. */}
        <MovementForm
          key={kind}
          kind={kind}
          categories={categories}
          cards={kind === "expense" ? cards : []}
          suggestions={suggestions}
          suggestedRate={suggestedRate}
          today={today}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
