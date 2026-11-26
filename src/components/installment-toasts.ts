"use client"

import { toast } from "sonner"

import type { IsoDate } from "@/lib/dates"
import { setInstallmentPaid } from "@/server/actions/movements"
import type { ActionResult } from "@/server/actions/result"

export type InstallmentKind = "income" | "expense"

/** "Pagada" o "Cobrada": una cuota de ingreso no se paga, se cobra. */
export function paidWord(kind: InstallmentKind): string {
  return kind === "income" ? "Cobrada" : "Pagada"
}

/**
 * Marca una cuota pagada y, si salió bien, avisa con un toast que trae
 * "Deshacer" (§5.1 del plan v2). Marcar no pide confirmación: es el caso de un
 * toque, y el toast es la red. Deshacer no confirma tampoco, porque deshace
 * algo que la persona acaba de hacer.
 *
 * Devuelve el resultado para que quien llama muestre el error en su lugar: un
 * fallo no se resuelve con un toast que desaparece.
 */
export async function markInstallmentPaid({
  id,
  kind,
  description,
  paidDate,
}: {
  id: string
  kind: InstallmentKind
  /** Qué se pagó, para que el toast no hable de "una cuota" sin decir cuál. */
  description: string
  paidDate?: IsoDate
}): Promise<ActionResult> {
  const result = await setInstallmentPaid(id, true, paidDate)
  if (result.ok) {
    toast.success(paidWord(kind), {
      description,
      action: { label: "Deshacer", onClick: () => void undo(id, kind) },
    })
  }
  return result
}

async function undo(id: string, kind: InstallmentKind) {
  const result = await setInstallmentPaid(id, false)
  if (result.ok) toast(kind === "income" ? "Cobro deshecho" : "Pago deshecho")
  else toast.error(result.message)
}

/** Desmarcar: lo llama el diálogo de confirmación, no un toque suelto. */
export async function unmarkInstallmentPaid({
  id,
  kind,
  description,
}: {
  id: string
  kind: InstallmentKind
  description: string
}): Promise<ActionResult> {
  const result = await setInstallmentPaid(id, false)
  if (result.ok) {
    toast(kind === "income" ? "Marcada como no cobrada" : "Marcada como no pagada", {
      description,
    })
  }
  return result
}
