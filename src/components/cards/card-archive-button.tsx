"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Archive, ArchiveRestore } from "lucide-react"

import { Button } from "@/components/ui/button"
import { setCardArchived } from "@/server/actions/cards"

/**
 * Archivar o desarchivar una tarjeta. Sin confirmación: no borra nada y se
 * deshace con el mismo botón. Archivada deja de ofrecerse como medio de pago;
 * sus compras y resúmenes siguen ahí.
 */
export function CardArchiveButton({
  id,
  name,
  archived,
}: {
  id: string
  name: string
  archived: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function toggle() {
    setError(null)
    startTransition(async () => {
      const result = await setCardArchived(id, !archived)
      if (!result.ok) {
        setError(result.message)
        return
      }
      toast.success(archived ? `${name} volvió a estar activa` : `${name} archivada`)
      router.refresh()
    })
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={toggle}>
        {archived ? <ArchiveRestore /> : <Archive />}
        {archived ? "Desarchivar" : "Archivar"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </span>
  )
}
