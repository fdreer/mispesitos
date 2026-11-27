"use client"

import { useState, useTransition } from "react"
import { es } from "date-fns/locale"
import { CalendarIcon, Check } from "lucide-react"

import { paidWord, markInstallmentPaid, unmarkInstallmentPaid } from "@/components/installment-toasts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { dateToIso, isoToDate, type IsoDate } from "@/lib/dates"
import { formatShortDate } from "@/lib/installments"

export function InstallmentPaidButton({
  id,
  paid,
  paidDate = null,
  today,
  number,
  description,
  kind = "expense",
  align = "end",
}: {
  id: string
  paid: boolean
  paidDate?: IsoDate | null
  today: IsoDate
  number: number
  description: string
  kind?: "income" | "expense"
  align?: "start" | "end"
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dateOpen, setDateOpen] = useState(false)

  const word = paidWord(kind)
  const toastText = `${description} · cuota ${number}`

  function mark(date?: IsoDate) {
    setError(null)
    startTransition(async () => {
      const result = await markInstallmentPaid({ id, kind, description: toastText, paidDate: date })
      if (!result.ok) setError(result.message)
    })
  }

  function unmark() {
    setError(null)
    startTransition(async () => {
      const result = await unmarkInstallmentPaid({ id, kind, description: toastText })
      if (!result.ok) setError(result.message)
    })
  }

  return (
    <span className={`flex flex-col gap-1 ${align === "end" ? "items-end" : "items-start"}`}>
      {paid ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              className="border border-pulse-green/20 bg-pulse-green/10 text-pulse-green hover:bg-pulse-green/15"
            >
              <Check />
              {word}
              {paidDate && ` · ${formatShortDate(paidDate, today)}`}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                ¿Desmarcar la cuota {number} de &ldquo;{description}&rdquo;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Vuelve a quedar pendiente y deja de contar en lo{" "}
                {kind === "income" ? "cobrado" : "pagado"} de su mes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={unmark}>Desmarcar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => mark()}
          >
            {kind === "income" ? "Marcar cobrada" : "Marcar pagada"}
          </Button>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={pending}
                aria-label={`Elegir fecha de ${kind === "income" ? "cobro" : "pago"} de la cuota ${number}`}
              >
                <CalendarIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <p className="text-muted-foreground px-3 pt-3 text-xs">
                ¿Qué día {kind === "income" ? "la cobraste" : "la pagaste"}?
              </p>
              <Calendar
                mode="single"
                locale={es}
                defaultMonth={isoToDate(today)}
                disabled={{ after: isoToDate(today) }}
                onSelect={(d) => {
                  if (!d) return
                  setDateOpen(false)
                  mark(dateToIso(d))
                }}
              />
            </PopoverContent>
          </Popover>
        </span>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </span>
  )
}
