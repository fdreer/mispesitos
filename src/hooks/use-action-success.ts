"use client"

import { useEffect, useRef } from "react"

import type { ActionResult } from "@/server/actions/result"

/**
 * Ejecuta `onSuccess` exactamente una vez cuando `state` pasa a `ok: true`,
 * evitando re-disparos por re-renders o cambios en el callback.
 */
export function useActionSuccess(
  state: ActionResult | null,
  onSuccess: () => void,
) {
  const handled = useRef<ActionResult | null>(null)
  const callbackRef = useRef(onSuccess)
  useEffect(() => {
    callbackRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state
      callbackRef.current()
    }
  }, [state])
}
