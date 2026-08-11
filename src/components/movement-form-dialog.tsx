"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { MovementForm } from "@/components/movement-form"
import type { IsoDate } from "@/lib/dates"
import type { Category } from "@/server/queries"

const TITLES: Record<"income" | "expense", string> = {
  income: "Nuevo ingreso",
  expense: "Nuevo egreso",
}

type Props = {
  kind: "income" | "expense"
  categories: Category[]
  suggestedRate: number | null
  today: IsoDate
}

export function MovementFormDialog({ kind, categories, suggestedRate, today }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus />
          Nuevo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITLES[kind]}</DialogTitle>
        </DialogHeader>
        <MovementForm
          kind={kind}
          categories={categories}
          suggestedRate={suggestedRate}
          today={today}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
