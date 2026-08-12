"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { setInstallmentPaid } from "@/server/actions/movements"

/**
 * El botón de "pagada" de UNA cuota, con su propio estado en vuelo y su propio
 * error.
 *
 * Antes esto vivía en `InstallmentRows`, que llevaba un `Set` de ids en vuelo
 * para que marcar una cuota no dejara muertos los botones de las otras. Con el
 * estado adentro de cada botón esa independencia sale sola —cada instancia
 * tiene su `useTransition`— y de paso el mismo botón sirve en los dos lugares
 * donde se muestran cuotas, que ya no comparten marcado: la tabla de
 * movimientos (una fila por cuota) y la lista de vencimientos del dashboard.
 *
 * El resultado de la Server Action se mira, nunca se descarta: si marcar falla,
 * la persona tiene que enterarse en vez de ver la cuota igual que antes sin
 * ninguna explicación.
 */
export function InstallmentPaidButton({
  id,
  paid,
  align = "end",
}: {
  id: string
  paid: boolean
  /** De qué lado se apilan el botón y su mensaje de error. */
  align?: "start" | "end"
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    setError(null)
    startTransition(async () => {
      const result = await setInstallmentPaid(id, !paid)
      if (!result.ok) setError(result.message)
    })
  }

  return (
    <span className={`flex flex-col gap-1 ${align === "end" ? "items-end" : "items-start"}`}>
      <Button
        type="button"
        size="sm"
        variant={paid ? "secondary" : "outline"}
        disabled={pending}
        onClick={handleToggle}
      >
        {paid ? "Pagada" : "Marcar pagada"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </span>
  )
}
