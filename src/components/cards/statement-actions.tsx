"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarCog, Check } from "lucide-react"

import { DateField } from "@/components/date-field"
import { Segmented } from "@/components/segmented"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatPeriod, type StatementPaymentMode } from "@/lib/cards"
import { formatIsoForDisplay, type IsoDate } from "@/lib/dates"
import { convertToArs, formatMoney, parseDecimalInput } from "@/lib/money"
import { payStatement, unpayStatement, updateStatementDates } from "@/server/actions/cards"
import type { ActionResult } from "@/server/actions/result"

export type StatementForActions = {
  id: string | null
  cardId: string
  cardName: string
  period: string
  closingDate: IsoDate
  dueDate: IsoDate
  paidDate: IsoDate | null
  arsCents: number
  usdCents: number
  count: number
}

function useOnSuccess(state: ActionResult | null, message: string, then: () => void) {
  const router = useRouter()
  const handled = useRef<ActionResult | null>(null)
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state
      toast.success(message)
      router.refresh()
      then()
    }
  }, [state, message, router, then])
}

export function PayStatementButton({
  statement,
  today,
  suggestedRate,
}: {
  statement: StatementForActions
  today: IsoDate
  suggestedRate: number | null
}) {
  const [open, setOpen] = useState(false)
  const notClosedYet = statement.closingDate > today
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        disabled={statement.count === 0 || notClosedYet}
        title={
          notClosedYet
            ? `Se paga cuando cierre, el ${formatIsoForDisplay(statement.closingDate)}.`
            : undefined
        }
      >
        Pagar resumen
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {open && (
            <PayStatementForm
              statement={statement}
              today={today}
              suggestedRate={suggestedRate}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PayStatementForm({
  statement,
  today,
  suggestedRate,
  onClose,
}: {
  statement: StatementForActions
  today: IsoDate
  suggestedRate: number | null
  onClose: () => void
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    payStatement,
    null,
  )
  // Hoy, salvo que el resumen todavía no haya cerrado: ahí no se puede pagar
  // (ver `resolveStatementPayment`) y el calendario arranca en el cierre.
  const [paidDate, setPaidDate] = useState(today < statement.closingDate ? statement.closingDate : today)
  const [mode, setMode] = useState<StatementPaymentMode>("usd")
  const [rate, setRate] = useState(suggestedRate === null ? "" : String(suggestedRate).replace(".", ","))
  useOnSuccess(state, `Resumen de ${formatPeriod(statement.period)} pagado`, onClose)

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {}
  const hasUsd = statement.usdCents > 0
  const parsedRate = parseDecimalInput(rate)
  const usdInPesos =
    hasUsd && mode === "ars" && parsedRate !== null && parsedRate > 0
      ? convertToArs(statement.usdCents, parsedRate)
      : null

  return (
    <form action={action} className="space-y-5">
      <DialogHeader>
        <DialogTitle>
          Pagar {statement.cardName} · {formatPeriod(statement.period)}
        </DialogTitle>
        <DialogDescription>
          {statement.count === 1
            ? "Marca pagada la cuota del resumen con la fecha que elijas."
            : `Marca pagadas las ${statement.count} cuotas del resumen con la fecha que elijas.`}
        </DialogDescription>
      </DialogHeader>

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <input type="hidden" name="statementId" value={statement.id ?? ""} />
      <input type="hidden" name="mode" value={mode} />

      <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
        {statement.arsCents > 0 && (
          <>
            <dt className="text-muted-foreground">En pesos</dt>
            <dd className="text-right tabular-nums">{formatMoney(statement.arsCents, "ARS")}</dd>
          </>
        )}
        {hasUsd && (
          <>
            <dt className="text-muted-foreground">En dólares</dt>
            <dd className="text-right tabular-nums">{formatMoney(statement.usdCents, "USD")}</dd>
          </>
        )}
      </dl>

      <div className="space-y-2">
        <Label htmlFor="statement-paid-date">Fecha de pago</Label>
        <DateField
          id="statement-paid-date"
          hiddenName="paidDate"
          value={paidDate}
          onChange={setPaidDate}
          disabledAfter={today}
          disabledBefore={statement.closingDate}
          ariaLabel={`Fecha de pago: ${formatIsoForDisplay(paidDate)}`}
        />
        {errors.paidDate && <p className="text-destructive text-xs">{errors.paidDate[0]}</p>}
      </div>

      {hasUsd && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">La parte en dólares la pagaste…</legend>
          <Segmented
            label="Cómo pagaste la parte en dólares"
            value={mode}
            onChange={setMode}
            options={[
              { value: "usd", label: "Con dólares" },
              { value: "ars", label: "Con pesos" },
            ]}
          />
          {mode === "ars" && (
            <div className="space-y-2">
              <Label htmlFor="statement-usd-rate">Tipo de cambio</Label>
              <Input
                id="statement-usd-rate"
                name="usdPaidRate"
                inputMode="decimal"
                required
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                aria-invalid={errors.usdPaidRate !== undefined}
                className="h-11"
              />
              {errors.usdPaidRate ? (
                <p className="text-destructive text-xs">{errors.usdPaidRate[0]}</p>
              ) : (
                <p className="text-muted-foreground text-xs" aria-live="polite">
                  {usdInPesos === null
                    ? "El que figura en el resumen."
                    : `${formatMoney(statement.usdCents, "USD")} son ${formatMoney(usdInPesos, "ARS")}: salen de tu saldo en pesos.`}
                </p>
              )}
            </div>
          )}
          {mode === "usd" && (
            <p className="text-muted-foreground text-xs">Salen de tu saldo en dólares.</p>
          )}
        </fieldset>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Pagando…" : "Pagar resumen"}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Desmarcar el resumen desmarca todas sus cuotas (§1.3). Pide confirmación,
 * como desmarcar una cuota suelta: saca plata de lo percibido.
 */
export function UnpayStatementButton({ statement }: { statement: StatementForActions }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function unpay() {
    if (!statement.id) return
    setError(null)
    startTransition(async () => {
      const result = await unpayStatement(statement.id!)
      if (!result.ok) {
        setError(result.message)
        return
      }
      toast.success(`Resumen de ${formatPeriod(statement.period)} desmarcado`)
      router.refresh()
    })
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="secondary" disabled={pending}>
            <Check />
            Pagado el {formatIsoForDisplay(statement.paidDate ?? "")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Desmarcar el resumen de {formatPeriod(statement.period)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statement.count === 1
                ? "Su cuota vuelve a quedar pendiente y deja de contar en lo pagado de su mes."
                : `Sus ${statement.count} cuotas vuelven a quedar pendientes y dejan de contar en lo pagado de su mes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={unpay}>Desmarcar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </span>
  )
}

/**
 * Corregir el cierre y el vencimiento cuando llega el resumen real (§1.2).
 * Con el resumen pagado no se ofrece: hay que desmarcarlo primero (§1.3).
 */
export function StatementDatesButton({ statement }: { statement: StatementForActions }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={statement.paidDate !== null}
        title={
          statement.paidDate !== null ? "Desmarcá el resumen para cambiarle las fechas." : undefined
        }
      >
        <CalendarCog />
        Corregir fechas
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {open && <StatementDatesForm statement={statement} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatementDatesForm({
  statement,
  onClose,
}: {
  statement: StatementForActions
  onClose: () => void
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateStatementDates,
    null,
  )
  const [closingDate, setClosingDate] = useState(statement.closingDate)
  const [dueDate, setDueDate] = useState(statement.dueDate)
  useOnSuccess(state, "Fechas del resumen guardadas", onClose)
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {}

  return (
    <form action={action} className="space-y-5">
      <DialogHeader>
        <DialogTitle>Fechas del resumen de {formatPeriod(statement.period)}</DialogTitle>
        <DialogDescription>
          Las del resumen que te mandó el banco. Las cuotas del resumen pasan a vencer el día nuevo;
          las compras que ya están adentro no se mueven.
        </DialogDescription>
      </DialogHeader>

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <input type="hidden" name="cardId" value={statement.cardId} />
      <input type="hidden" name="period" value={statement.period} />

      <div className="space-y-2">
        <Label htmlFor="statement-closing">Cierre</Label>
        <DateField
          id="statement-closing"
          hiddenName="closingDate"
          value={closingDate}
          onChange={setClosingDate}
          ariaLabel={`Cierre: ${formatIsoForDisplay(closingDate)}`}
        />
        {errors.closingDate && <p className="text-destructive text-xs">{errors.closingDate[0]}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="statement-due">Vencimiento</Label>
        <DateField
          id="statement-due"
          hiddenName="dueDate"
          value={dueDate}
          onChange={setDueDate}
          ariaLabel={`Vencimiento: ${formatIsoForDisplay(dueDate)}`}
        />
        {errors.dueDate && <p className="text-destructive text-xs">{errors.dueDate[0]}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar fechas"}
        </Button>
      </DialogFooter>
    </form>
  )
}
