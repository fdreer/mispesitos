"use client"

import { toast } from "sonner"

import type { IsoDate } from "@/lib/dates"
import { setInstallmentPaid } from "@/server/actions/movements"
import type { ActionResult } from "@/server/actions/result"

export type InstallmentKind = "income" | "expense"

export function paidWord(kind: InstallmentKind): string {
  return kind === "income" ? "Cobrada" : "Pagada"
}

export async function markInstallmentPaid({
  id,
  kind,
  description,
  paidDate,
}: {
  id: string
  kind: InstallmentKind
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
