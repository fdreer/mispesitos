"use client"

import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import { AlertTriangle, CalendarCog, Check } from "lucide-react"

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
import { Checkbox } from "@/components/ui/checkbox"
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
import { useActionSuccess } from "@/hooks/use-action-success"
import { effectiveStatementRate, formatPeriod, type StatementPaymentMode } from "@/lib/cards"
import { formatIsoForDisplay, type IsoDate } from "@/lib/dates"
import {
  centsToAmountInput,
  convertToArs,
  formatAmountInput,
  formatMoney,
  parseAmountToCents,
  parseDecimalInput,
} from "@/lib/money"
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

const centsToInput = centsToAmountInput

function useOnSuccess(state: ActionResult | null, message: string, then: () => void) {
  useActionSuccess(state, () => {
    toast.success(message)
    then()
  })
}

export function PayStatementButton({
  statement,
  today,
  officialSellRate,
  suggestedBuyRate,
  usdBalanceCents,
  size = "default",
  label = "Pagar resumen",
}: {
  statement: StatementForActions
  today: IsoDate
  officialSellRate: number | null
  suggestedBuyRate: number | null
  usdBalanceCents: number
  size?: "default" | "sm"
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const notClosedYet = statement.closingDate > today
  return (
    <>
      <Button
        type="button"
        size={size}
        onClick={() => setOpen(true)}
        disabled={statement.count === 0 || notClosedYet}
        title={
          notClosedYet
            ? `Se paga cuando cierre, el ${formatIsoForDisplay(statement.closingDate)}.`
            : undefined
        }
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {open && (
            <PayStatementForm
              statement={statement}
              today={today}
              officialSellRate={officialSellRate}
              suggestedBuyRate={suggestedBuyRate}
              usdBalanceCents={usdBalanceCents}
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
  officialSellRate,
  suggestedBuyRate,
  usdBalanceCents,
  onClose,
}: {
  statement: StatementForActions
  today: IsoDate
  officialSellRate: number | null
  suggestedBuyRate: number | null
  usdBalanceCents: number
  onClose: () => void
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    payStatement,
    null,
  )
  const [paidDate, setPaidDate] = useState(
    today < statement.closingDate ? statement.closingDate : today,
  )
  const [mode, setMode] = useState<StatementPaymentMode>("usd")

  const hasUsd = statement.usdCents > 0
  const estimatedArsCents =
    hasUsd && officialSellRate !== null && officialSellRate > 0
      ? convertToArs(statement.usdCents, officialSellRate)
      : null
  const [usdPaidArs, setUsdPaidArs] = useState(
    estimatedArsCents !== null ? centsToInput(estimatedArsCents) : "",
  )

  const shortfallCents = Math.max(0, statement.usdCents - Math.max(0, usdBalanceCents))
  const [registerExchange, setRegisterExchange] = useState(shortfallCents > 0)
  const [exchangeUsd, setExchangeUsd] = useState(
    shortfallCents > 0
      ? centsToInput(shortfallCents)
      : hasUsd
        ? centsToInput(statement.usdCents)
        : "",
  )
  const [exchangeRate, setExchangeRate] = useState(
    suggestedBuyRate === null ? "" : String(suggestedBuyRate).replace(".", ","),
  )

  useOnSuccess(state, `Resumen de ${formatPeriod(statement.period)} pagado`, onClose)

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {}

  const parsedUsdPaidArs = parseAmountToCents(usdPaidArs)
  const effRate =
    hasUsd && mode === "ars" && parsedUsdPaidArs !== null && parsedUsdPaidArs > 0
      ? effectiveStatementRate(parsedUsdPaidArs, statement.usdCents)
      : null

  const parsedExchangeUsd = parseAmountToCents(exchangeUsd)
  const parsedExchangeRate = parseDecimalInput(exchangeRate)
  const exchangeArsCents =
    parsedExchangeUsd !== null &&
    parsedExchangeUsd > 0 &&
    parsedExchangeRate !== null &&
    parsedExchangeRate > 0
      ? convertToArs(parsedExchangeUsd, parsedExchangeRate)
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

      <dl className="grid grid-cols-2 gap-2 rounded-lg bg-white/[0.03] px-3.5 py-3 text-sm">
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
          <legend className="mb-2 text-xs text-muted-foreground">
            La parte en dólares la pagaste…
          </legend>
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
              <Label htmlFor="statement-usd-paid-ars">
                Total en pesos debitado por los {formatMoney(statement.usdCents, "USD")}
              </Label>
              <Input
                id="statement-usd-paid-ars"
                name="usdPaidArs"
                inputMode="decimal"
                required
                value={usdPaidArs}
                onChange={(e) => setUsdPaidArs(formatAmountInput(e.target.value, usdPaidArs))}
                aria-invalid={errors.usdPaidArs !== undefined}
                className="h-10 tabular-nums"
              />
              {errors.usdPaidArs ? (
                <p className="text-destructive text-xs">{errors.usdPaidArs[0]}</p>
              ) : (
                <p className="text-muted-foreground text-xs" aria-live="polite">
                  {effRate !== null
                    ? `TC efectivo: ${formatMoney(Math.round(effRate * 100), "ARS")} por dólar (impuestos y cargos incluidos).`
                    : "Incluí impuestos y cargos que te debitó el banco."}
                </p>
              )}
            </div>
          )}

          {mode === "usd" && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs">
                Saldo en dólares disponible:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatMoney(usdBalanceCents, "USD")}
                </span>
                . Salen de tu saldo en dólares.
              </p>

              {shortfallCents > 0 && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    No te alcanza el saldo en dólares: faltan{" "}
                    <strong className="tabular-nums">{formatMoney(shortfallCents, "USD")}</strong>.
                    Podés registrar la compra acá mismo.
                  </span>
                </div>
              )}

              <input
                type="hidden"
                name="registerExchange"
                value={registerExchange ? "true" : "false"}
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={registerExchange}
                  onCheckedChange={(checked) => setRegisterExchange(checked === true)}
                />
                <span>Registrar compra de dólares</span>
              </label>

              {registerExchange && (
                <div className="space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="statement-exchange-usd">Dólares a comprar</Label>
                      <Input
                        id="statement-exchange-usd"
                        name="exchangeUsd"
                        inputMode="decimal"
                        required
                        value={exchangeUsd}
                        onChange={(e) =>
                          setExchangeUsd(formatAmountInput(e.target.value, exchangeUsd))
                        }
                        aria-invalid={errors.exchangeUsd !== undefined}
                        className="h-9 tabular-nums"
                      />
                      {errors.exchangeUsd && (
                        <p className="text-destructive text-xs">{errors.exchangeUsd[0]}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="statement-exchange-rate">Tipo de cambio</Label>
                      <Input
                        id="statement-exchange-rate"
                        name="exchangeRate"
                        inputMode="decimal"
                        required
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(e.target.value)}
                        aria-invalid={errors.exchangeRate !== undefined}
                        className="h-9 tabular-nums"
                      />
                      {errors.exchangeRate && (
                        <p className="text-destructive text-xs">{errors.exchangeRate[0]}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-muted-foreground text-xs" aria-live="polite">
                    Se registra con fecha {formatIsoForDisplay(paidDate)}
                    {exchangeArsCents !== null
                      ? ` · salen ${formatMoney(exchangeArsCents, "ARS")} de tu saldo en pesos.`
                      : "."}
                  </p>
                </div>
              )}
            </div>
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
