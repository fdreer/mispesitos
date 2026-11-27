"use client"

import { createContext, Suspense, use, useState } from "react"
import { Plus } from "lucide-react"

import { MovementFormDialog } from "@/components/movement-form-dialog"
import { Button } from "@/components/ui/button"
import type { IsoDate } from "@/lib/dates"
import type { CardOption, DescriptionSuggestion } from "@/server/card-queries"
import type { Category } from "@/server/queries"

const OpenNewMovement = createContext<(() => void) | null>(null)

type Props = {
  kind: "income" | "expense"
  categories: Category[]
  cards: CardOption[]
  today: IsoDate
  /**
   * Sin esperar: la barra de filtros no tiene por qué frenarse por las
   * sugerencias del autocompletado, que sólo hacen falta al abrir el diálogo.
   */
  suggestions: Promise<DescriptionSuggestion[]>
  children: React.ReactNode
}

/**
 * Un único diálogo de alta por pantalla. La barra de filtros muestra el botón
 * "Nuevo" en dos lugares (móvil y escritorio); antes cada uno traía y
 * serializaba sus propias categorías, tarjetas y sugerencias, y montaba su
 * propio diálogo. Ahora los dos botones abren este.
 */
export function NewMovementProvider({
  kind,
  categories,
  cards,
  today,
  suggestions,
  children,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <OpenNewMovement value={() => setOpen(true)}>
      {children}
      <Suspense fallback={null}>
        <SharedDialog
          kind={kind}
          categories={categories}
          cards={cards}
          today={today}
          suggestions={suggestions}
          open={open}
          onOpenChange={setOpen}
        />
      </Suspense>
    </OpenNewMovement>
  )
}

function SharedDialog({
  suggestions,
  ...props
}: Omit<Props, "children"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <MovementFormDialog {...props} suggestions={use(suggestions)} />
}

export function NewMovementButton({ label = "Nuevo" }: { label?: string }) {
  const openDialog = use(OpenNewMovement)
  return (
    <Button type="button" onClick={() => openDialog?.()} disabled={openDialog === null}>
      <Plus />
      {label}
    </Button>
  )
}
