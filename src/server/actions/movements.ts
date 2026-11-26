"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { withUser, type Tx } from "@/db/client"
import { category, installment, movement } from "@/db/schema"
import { isCheckViolation } from "@/lib/db-errors"
import { todayInAr, type IsoDate } from "@/lib/dates"
import { highestPaidNumber, resolvePaidDate } from "@/lib/installments"
import { logDbError } from "@/lib/log-db-error"
import { assertInstallmentMovementKind } from "@/lib/movement-asserts"
import { BASE_PATHS } from "@/lib/movement-routes"
import { exchangeSchema, movementSchema } from "@/lib/schemas"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

/**
 * Un movimiento sólo puede ir a una categoría HOJA (decisión 7.4 del plan v2):
 * una subcategoría, o una de primer nivel sin hijas. La base lo hace cumplir
 * con el trigger `movement_category_is_leaf` (migración 0011); esto es para
 * que la persona vea el error junto al campo y no un genérico al guardar.
 *
 * Desde el formulario no pasa —el selector no ofrece padres como opción—,
 * pero el borde de confianza es la Server Action.
 */
const CATEGORIA_NO_HOJA = "Esa categoría tiene subcategorías: elegí una de ellas."

async function categoryHasChildren(tx: Tx, categoryId: string): Promise<boolean> {
  const [child] = await tx
    .select({ id: category.id })
    .from(category)
    .where(eq(category.parentId, categoryId))
    .limit(1)
  return child !== undefined
}

const categoryNotLeaf = () => failure(CATEGORIA_NO_HOJA, { categoryId: [CATEGORIA_NO_HOJA] })

/**
 * Las cuotas viajan en el FormData como campos repetidos, en el mismo orden:
 * installmentAmount[] e installmentDueDate[]. El emparejamiento es posicional,
 * así que si las dos listas no vienen del mismo largo no hay forma de saber qué
 * importe corresponde a qué vencimiento: se rechaza en vez de adivinar.
 */
function readInstallments(formData: FormData): { amountCents: string; dueDate: string }[] | null {
  const amounts = formData.getAll("installmentAmount").map(String)
  const dates = formData.getAll("installmentDueDate").map(String)
  if (amounts.length !== dates.length) return null
  return amounts.map((amountCents, i) => ({ amountCents, dueDate: dates[i] }))
}

export async function createMovement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()
  const settled = formData.get("settled") === "true"

  const installments = readInstallments(formData)
  if (installments === null) {
    return failure("El plan de cuotas llegó incompleto. Recargá la página y probá de nuevo.")
  }

  const parsed = movementSchema.safeParse({
    kind: formData.get("kind"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    date: formData.get("date"),
    currency: formData.get("currency"),
    amountCents: formData.get("amountCents") ?? "",
    rate: formData.get("rate") ?? "1",
    installments,
  })

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá los datos.", flat.fieldErrors)
  }

  const input = parsed.data
  const movementId = randomUUID()
  const installmentsToSave = settled
    ? [{ amountCents: input.amountCents, dueDate: input.date }]
    : input.installments

  try {
    const resultado = await withUser(user.id, async (tx) => {
      if (await categoryHasChildren(tx, input.categoryId)) return categoryNotLeaf()

      await tx.insert(movement).values({
        id: movementId,
        userId: user.id,
        kind: input.kind,
        description: input.description,
        categoryId: input.categoryId,
        date: input.date,
        currency: input.currency,
        amountCents: input.amountCents,
        rate: String(input.rate),
        direction: null,
      })

      await tx.insert(installment).values(
        installmentsToSave.map((cuota, index) => ({
          id: randomUUID(),
          movementId,
          userId: user.id,
          number: index + 1,
          amountCents: cuota.amountCents,
          dueDate: cuota.dueDate,
          paid: settled,
          paidDate: settled ? cuota.dueDate : null,
        })),
      )
      return success()
    })
    if (!resultado.ok) return resultado
  } catch (error) {
    logDbError("createMovement", error)
    // La carrera: otra pestaña le creó una subcategoría a esta categoría
    // entre que se abrió el formulario y se guardó.
    if (isCheckViolation(error, "movement_category_is_leaf")) return categoryNotLeaf()
    return failure("No pudimos guardar el movimiento. Probá de nuevo.")
  }

  revalidatePath("/dashboard")
  // Del mapa compartido, no armada acá: `BASE_PATHS` existe para que la ruta
  // de cada tipo esté escrita una sola vez. Repetirla acá dejaba la acción
  // revalidando la ruta vieja el día que el mapa cambie, sin que nada falle.
  revalidatePath(BASE_PATHS[input.kind])
  return success()
}

/**
 * Los dos tipos que esta acción puede tocar. Un `exchange` NO entra: no tiene
 * cuotas ni categoría, y reescribirlo con la forma de un movimiento común
 * dejaría a /cambios leyendo una fila que ya no es un cambio. Va en el WHERE
 * y no en un chequeo posterior para que un id de cambio salga por la misma
 * rama que un id que no existe.
 */
const EDITABLE_KINDS = ["income", "expense"]

/**
 * Edita un movimiento ya guardado. Hasta ahora la única forma era borrarlo y
 * volver a cargarlo, que además se llevaba las cuotas ya marcadas como pagas.
 *
 * El plan de cuotas se rehace ENTERO con el que manda el formulario —es el
 * mismo que arma `buildInstallments`, y pasa por el mismo `movementSchema` que
 * el alta— pero el PAGO no se pierde: `paid`/`paid_date` se conservan
 * emparejando por NÚMERO de cuota. Un número que el plan nuevo no tiene se
 * rechaza antes de escribir nada (ver `highestPaidNumber`): bajar de 12 cuotas
 * a 3 con la 5 ya paga borraría el registro de un pago que sí ocurrió, y eso no
 * es una edición, es plata que desaparece.
 *
 * Lo que un cambio de importe SÍ hace es mover lo que dice una cuota ya paga:
 * si la 1 estaba paga en $100.000 y el total pasa a $360.000 en tres, la 1
 * queda paga en $120.000. Es exactamente lo que significa corregir el importe
 * de un movimiento cargado mal, y es la razón por la que el saldo tiene que
 * recalcularse — de ahí que se revalide el dashboard igual que en el alta.
 *
 * `kind` NO se escribe aunque el esquema lo exija (el formulario lo manda
 * porque es el mismo esquema del alta): un ingreso no se convierte en un
 * egreso, y si lo hiciera cambiaría de pantalla y esta acción estaría
 * revalidando la que la persona ya no está mirando.
 */
export async function updateMovement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const id = z.uuid().safeParse(formData.get("id"))
  if (!id.success) {
    return failure("Ese movimiento no existe.")
  }

  const installments = readInstallments(formData)
  if (installments === null) {
    return failure("El plan de cuotas llegó incompleto. Recargá la página y probá de nuevo.")
  }

  const parsed = movementSchema.safeParse({
    kind: formData.get("kind"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    date: formData.get("date"),
    currency: formData.get("currency"),
    amountCents: formData.get("amountCents") ?? "",
    rate: formData.get("rate") ?? "1",
    installments,
  })

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá los datos.", flat.fieldErrors)
  }

  const input = parsed.data
  // Se llena adentro de la transacción y se lee después, para revalidar. Queda
  // en `null` por cualquiera de las dos salidas tempranas, que es justo cuando
  // no hay nada que revalidar.
  let kindGuardado: "income" | "expense" | null = null

  try {
    const resultado = await withUser(user.id, async (tx) => {
      const previas = await tx
        .select({
          number: installment.number,
          paid: installment.paid,
          paidDate: installment.paidDate,
        })
        .from(installment)
        .where(and(eq(installment.movementId, id.data), eq(installment.userId, user.id)))

      if (await categoryHasChildren(tx, input.categoryId)) return categoryNotLeaf()

      const masAlta = highestPaidNumber(previas)
      if (masAlta > input.installments.length) {
        return failure(
          `La cuota ${masAlta} está paga: no podés dejar el plan en ${input.installments.length}. ` +
            `Desmarcala primero.`,
        )
      }

      const actualizado = await tx
        .update(movement)
        .set({
          description: input.description,
          categoryId: input.categoryId,
          date: input.date,
          currency: input.currency,
          amountCents: input.amountCents,
          rate: String(input.rate),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(movement.id, id.data),
            eq(movement.userId, user.id),
            inArray(movement.kind, EDITABLE_KINDS),
          ),
        )
        // El `kind` sale de la fila, no del formulario: es el que decide qué
        // pantalla revalidar, y el del formulario es un dato del cliente que
        // esta acción a propósito no escribe.
        .returning({ id: movement.id, kind: movement.kind })

      if (actualizado.length === 0) return failure("Ese movimiento no existe.")

      // El WHERE ya acotó a `EDITABLE_KINDS`; el assert es lo que convierte esa
      // garantía en el tipo, con el mismo criterio que el resto de la app.
      kindGuardado = assertInstallmentMovementKind(actualizado[0].kind)

      const pagoPorNumero = new Map(previas.map((p) => [p.number, p]))

      // Reemplazo y no UPDATE fila por fila: la cantidad de cuotas puede subir
      // o bajar, así que igual habría que insertar y borrar. Adentro de la
      // misma transacción, así que en ningún momento el movimiento queda sin
      // sus cuotas para nadie más.
      await tx
        .delete(installment)
        .where(and(eq(installment.movementId, id.data), eq(installment.userId, user.id)))

      await tx.insert(installment).values(
        input.installments.map((cuota, index) => {
          const number = index + 1
          const previo = pagoPorNumero.get(number)
          return {
            id: randomUUID(),
            movementId: id.data,
            userId: user.id,
            number,
            amountCents: cuota.amountCents,
            dueDate: cuota.dueDate,
            // Sin `?? false` el tipo sería `boolean | undefined` y la fila
            // caería en el default de la columna, que da lo mismo hoy y
            // dejaría de darlo el día que el default cambie.
            paid: previo?.paid ?? false,
            paidDate: previo?.paidDate ?? null,
          }
        }),
      )

      return success()
    })

    if (!resultado.ok) return resultado
  } catch (error) {
    logDbError("updateMovement", error)
    if (isCheckViolation(error, "movement_category_is_leaf")) return categoryNotLeaf()
    return failure("No pudimos guardar los cambios. Probá de nuevo.")
  }

  // El importe y las fechas de las cuotas pagas pueden haber cambiado, así que
  // el saldo del dashboard ya no es el que estaba calculado.
  revalidatePath("/dashboard")
  if (kindGuardado) revalidatePath(BASE_PATHS[kindGuardado])
  return success()
}

/**
 * Compra o venta de dólares. Un cambio NO genera cuotas: es instantáneo y
 * mueve las dos monedas de una. `categoryId` va `null` a propósito — la FK de
 * `movement` es compuesta `(user_id, category_id) → category (user_id, id)`
 * con `MATCH SIMPLE`, así que una columna nula de la FK pasa sin problema.
 */
export async function createExchange(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = exchangeSchema.safeParse({
    direction: formData.get("direction"),
    date: formData.get("date"),
    usdCents: formData.get("usdCents") ?? "",
    rate: formData.get("rate") ?? "",
  })

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá los datos.", flat.fieldErrors)
  }

  const input = parsed.data

  try {
    await withUser(user.id, (tx) =>
      tx.insert(movement).values({
        id: randomUUID(),
        userId: user.id,
        kind: "exchange",
        description: input.direction === "buy" ? "Compra de dólares" : "Venta de dólares",
        categoryId: null,
        date: input.date,
        currency: "USD",
        amountCents: input.usdCents,
        rate: String(input.rate),
        direction: input.direction,
      }),
    )
  } catch (error) {
    logDbError("createExchange", error)
    return failure("No pudimos registrar la operación.")
  }

  revalidatePath("/", "layout")
  return success()
}

/**
 * Los ids de movimiento los genera `randomUUID()`: validar que lo que llega
 * es un UUID es el borde de confianza mínimo para una Server Action, incluso
 * cuando el único otro filtro (userId) ya lo cierra la RLS de la base.
 */
const deleteMovementIdSchema = z.uuid("Ese movimiento no existe.")

export async function deleteMovement(id: string): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = deleteMovementIdSchema.safeParse(id)
  if (!parsed.success) {
    return failure("Ese movimiento no existe.")
  }

  try {
    // Las cuotas caen solas por el ON DELETE CASCADE.
    await withUser(user.id, (tx) =>
      tx
        .delete(movement)
        .where(and(eq(movement.id, parsed.data), eq(movement.userId, user.id))),
    )
  } catch (error) {
    logDbError("deleteMovement", error)
    return failure("No pudimos borrar el movimiento.")
  }

  revalidatePath("/", "layout")
  return success()
}

/**
 * Los ids de cuota los genera `randomUUID()`, igual que los de movimiento:
 * mismo criterio que `deleteMovementIdSchema` — validar que sea un UUID es
 * el borde de confianza mínimo, incluso cuando la RLS ya filtra por userId.
 */
const setInstallmentPaidSchema = z.object({
  id: z.uuid("Esa cuota no existe."),
  paid: z.boolean(),
  paidDate: z.string().optional(),
})

/**
 * Marca o desmarca una cuota. `paidDate` es opcional: sin ella la cuota queda
 * pagada hoy (reloj de Buenos Aires), el caso de un toque. La regla de qué
 * fecha se acepta vive en `resolvePaidDate` (@/lib/installments), probada sin
 * base.
 */
export async function setInstallmentPaid(
  id: string,
  paid: boolean,
  paidDate?: IsoDate,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = setInstallmentPaidSchema.safeParse({ id, paid, paidDate })
  if (!parsed.success) {
    return failure("Esa cuota no existe.")
  }

  const resolved = resolvePaidDate(parsed.data.paid, parsed.data.paidDate, todayInAr())
  if (!resolved.ok) return failure(resolved.message)

  try {
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(installment)
        .set({ paid: parsed.data.paid, paidDate: resolved.paidDate })
        .where(and(eq(installment.id, parsed.data.id), eq(installment.userId, user.id)))
        .returning({ id: installment.id }),
    )

    if (updated.length === 0) return failure("No encontramos esa cuota.")
  } catch (error) {
    logDbError("setInstallmentPaid", error)
    return failure("No pudimos actualizar la cuota.")
  }

  revalidatePath("/", "layout")
  return success()
}
