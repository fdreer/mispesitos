export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> }

export const success = (): ActionResult => ({ ok: true })

export const failure = (
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult => ({ ok: false, message, fieldErrors })

export const idle: ActionResult | null = null
