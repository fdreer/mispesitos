"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { withUser, type Tx } from "@/db/client"
import { category, installment, movement } from "@/db/schema"
import { isCheckViolation } from "@/lib/db-errors"
import { addDaysIso, diffDaysIso, isValidIsoDate, todayInAr, type IsoDate } from "@/lib/dates"
import { highestPaidNumber, resolvePaidDate } from "@/lib/installments"
import { logDbError } from "@/lib/log-db-error"
import {
  CURRENCY_VALUES,
  DIR_VALUES,
  SEARCH_MAX,
  SORT_VALUES,
  STATUS_VALUES,
  type MovementQuery,
} from "@/lib/movement-query"
import { assertCurrency, assertInstallmentMovementKind } from "@/lib/movement-asserts"
import { exchangeSchema, isoDate, movementSchema } from "@/lib/schemas"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { planCardInstallments } from "@/server/card-plan"
import { queryMovementsView, type MovementWithInstallments } from "@/server/queries"
import { requireUser } from "@/server/session"

const CATEGORIA_NO_HOJA = "Esa categoría tiene subcategorías: elegí una de ellas."
const CATEGORIA_ARCHIVADA = "Esa categoría está archivada."

async function categoryHasChildren(tx: Tx, userId: string, categoryId: string): Promise<boolean> {
  const [child] = await tx
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.parentId, categoryId), eq(category.userId, userId)))
    .limit(1)
  return child !== undefined
}

async function isCategoryArchived(tx: Tx, userId: string, categoryId: string): Promise<boolean> {
  const [row] = await tx
    .select({ archived: category.archived })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.userId, userId)))
    .limit(1)
  return Boolean(row?.archived)
}

const categoryNotLeaf = () => failure(CATEGORIA_NO_HOJA, { categoryId: [CATEGORIA_NO_HOJA] })
const categoryArchived = () => failure(CATEGORIA_ARCHIVADA, { categoryId: [CATEGORIA_ARCHIVADA] })

function readCardId(formData: FormData): string | null | undefined {
  const raw = String(formData.get("creditCardId") ?? "")
  if (raw === "") return null
  const parsed = z.uuid().safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

const TARJETA_INVALIDA = "Esa tarjeta no existe."
const invalidCard = () => failure(TARJETA_INVALIDA, { creditCardId: [TARJETA_INVALIDA] })

const SOLO_EGRESOS = "Sólo un egreso se puede pagar con tarjeta."

const RESUMEN_CAMBIO = "Un resumen de la tarjeta cambió mientras cargabas. Probá de nuevo."

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
  const cardId = readCardId(formData)
  if (cardId === undefined) return invalidCard()

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
  if (cardId !== null && input.kind !== "expense") return failure(SOLO_EGRESOS)
  if (cardId !== null && settled) {
    return failure("Una compra con tarjeta se paga con el resumen: no se carga como pagada.")
  }

  const movementId = randomUUID()
  const installmentsToSave = settled
    ? [{ amountCents: input.amountCents, dueDate: input.date }]
    : input.installments

  try {
    const resultado = await withUser(user.id, async (tx) => {
      if (await isCategoryArchived(tx, user.id, input.categoryId)) return categoryArchived()
      if (await categoryHasChildren(tx, user.id, input.categoryId)) return categoryNotLeaf()

      const cardPlan =
        cardId === null
          ? null
          : await planCardInstallments(tx, user.id, {
              cardId,
              purchaseDate: input.date,
              amounts: installmentsToSave.map((c) => c.amountCents),
              previous: [],
              previousCardId: null,
              previousPurchaseDate: null,
            })
      if (cardPlan && !cardPlan.ok) return cardPlan.result

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
        creditCardId: cardId,
      })

      await tx.insert(installment).values(
        cardPlan
          ? cardPlan.rows.map((cuota, index) => ({
              id: randomUUID(),
              movementId,
              userId: user.id,
              number: index + 1,
              ...cuota,
            }))
          : installmentsToSave.map((cuota, index) => ({
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
    if (isCheckViolation(error, "movement_category_is_leaf")) return categoryNotLeaf()
    if (isCheckViolation(error, "installment_matches_statement")) return failure(RESUMEN_CAMBIO)
    return failure("No pudimos guardar el movimiento. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}

const EDITABLE_KINDS = ["income", "expense"]

type MovementInput = z.output<typeof movementSchema>

/**
 * El corazón de `updateMovement`, adentro de una transacción ya abierta:
 * valida categoría, cuotas pagas y tarjeta, y reemplaza el movimiento y su
 * plan de cuotas. Lo reutiliza `patchMovement` para la edición inline de
 * fecha e importe, así las reglas viven en un solo lugar.
 */
async function applyMovementUpdate(
  tx: Tx,
  userId: string,
  id: string,
  input: MovementInput,
  cardId: string | null,
): Promise<ActionResult> {
  const [actual] = await tx
    .select({
      kind: movement.kind,
      creditCardId: movement.creditCardId,
      date: movement.date,
      categoryId: movement.categoryId,
    })
    .from(movement)
    .where(
      and(
        eq(movement.id, id),
        eq(movement.userId, userId),
        inArray(movement.kind, EDITABLE_KINDS),
      ),
    )
  if (!actual) return failure("Ese movimiento no existe.")
  if (cardId !== null && actual.kind !== "expense") return failure(SOLO_EGRESOS)

  const previas = await tx
    .select({
      number: installment.number,
      amountCents: installment.amountCents,
      paid: installment.paid,
      paidDate: installment.paidDate,
      statementId: installment.statementId,
    })
    .from(installment)
    .where(and(eq(installment.movementId, id), eq(installment.userId, userId)))

  if (
    input.categoryId !== actual.categoryId &&
    (await isCategoryArchived(tx, userId, input.categoryId))
  ) {
    return categoryArchived()
  }
  if (await categoryHasChildren(tx, userId, input.categoryId)) return categoryNotLeaf()

  const masAlta = highestPaidNumber(previas)
  if (masAlta > input.installments.length) {
    return failure(
      `La cuota ${masAlta} está paga: no podés dejar el plan en ${input.installments.length}. ` +
        `Desmarcala primero.`,
    )
  }

  if (cardId === null && previas.some((p) => p.statementId !== null && p.paid)) {
    return failure(
      "Tiene cuotas en un resumen de tarjeta ya pagado: desmarcalo antes de cambiar el medio de pago.",
    )
  }

  // Con tarjeta: el plan sale de los resúmenes, y una edición no puede
  // cambiar lo que tenía un resumen ya pagado (ver `planCardInstallments`).
  const cardPlan =
    cardId === null
      ? null
      : await planCardInstallments(tx, userId, {
          cardId,
          purchaseDate: input.date,
          amounts: input.installments.map((c) => c.amountCents),
          previous: previas,
          previousCardId: actual.creditCardId,
          previousPurchaseDate: actual.date,
        })
  if (cardPlan && !cardPlan.ok) return cardPlan.result

  const actualizado = await tx
    .update(movement)
    .set({
      description: input.description,
      categoryId: input.categoryId,
      date: input.date,
      currency: input.currency,
      amountCents: input.amountCents,
      rate: String(input.rate),
      creditCardId: cardId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(movement.id, id),
        eq(movement.userId, userId),
        inArray(movement.kind, EDITABLE_KINDS),
      ),
    )
    .returning({ id: movement.id })

  if (actualizado.length === 0) return failure("Ese movimiento no existe.")

  const pagoPorNumero = new Map(previas.map((p) => [p.number, p]))

  // Reemplazo y no UPDATE fila por fila: la cantidad de cuotas puede subir
  // o bajar, así que igual habría que insertar y borrar. Adentro de la
  // misma transacción, así que en ningún momento el movimiento queda sin
  // sus cuotas para nadie más.
  await tx
    .delete(installment)
    .where(and(eq(installment.movementId, id), eq(installment.userId, userId)))

  if (cardPlan) {
    await tx.insert(installment).values(
      cardPlan.rows.map((cuota, index) => ({
        id: randomUUID(),
        movementId: id,
        userId,
        number: index + 1,
        ...cuota,
      })),
    )
    return success()
  }

  await tx.insert(installment).values(
    input.installments.map((cuota, index) => {
      const number = index + 1
      const previo = pagoPorNumero.get(number)
      return {
        id: randomUUID(),
        movementId: id,
        userId,
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
}

export async function updateMovement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const id = z.uuid().safeParse(formData.get("id"))
  if (!id.success) {
    return failure("Ese movimiento no existe.")
  }

  const cardId = readCardId(formData)
  if (cardId === undefined) return invalidCard()

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
  if (cardId !== null && input.kind !== "expense") return failure(SOLO_EGRESOS)

  try {
    const resultado = await withUser(user.id, (tx) =>
      applyMovementUpdate(tx, user.id, id.data, input, cardId),
    )

    if (!resultado.ok) return resultado
  } catch (error) {
    logDbError("updateMovement", error)
    if (isCheckViolation(error, "movement_category_is_leaf")) return categoryNotLeaf()
    if (isCheckViolation(error, "installment_matches_statement")) return failure(RESUMEN_CAMBIO)
    if (isCheckViolation(error, "movement_credit_card_only_expense")) return failure(SOLO_EGRESOS)
    return failure("No pudimos guardar los cambios. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}

const VARIAS_CUOTAS =
  "Tiene varias cuotas: editá la fecha o el importe desde el detalle para recalcularlas."

const patchMovementSchema = z.object({
  id: z.uuid("Ese movimiento no existe."),
  patch: z.union([
    z.strictObject({ categoryId: z.string().min(1, "Elegí una categoría.").max(100) }),
    z.strictObject({ date: isoDate }),
    z.strictObject({
      amountCents: z
        .number()
        .int()
        .positive("El importe tiene que ser mayor a cero.")
        .max(Number.MAX_SAFE_INTEGER),
    }),
  ]),
})

export type MovementPatch =
  | { categoryId: string }
  | { date: IsoDate }
  | { amountCents: number }

/**
 * Edición inline desde la tabla: cambia un solo campo (categoría, fecha o
 * importe). La categoría se cambia directo; fecha e importe pasan por las
 * mismas reglas que `updateMovement` (incluida la reasignación de resumen de
 * una compra con tarjeta) y sólo se aceptan con una única cuota: con varias,
 * cambiar el total o la fecha obliga a recalcular el plan, y eso se hace
 * desde el detalle.
 */
export async function patchMovement(id: string, patch: MovementPatch): Promise<ActionResult> {
  const user = await requireUser()

  if (!z.uuid().safeParse(id).success) return failure("Ese movimiento no existe.")
  const parsed = patchMovementSchema.safeParse({ id, patch })
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá el dato.")
  }
  const { id: movementId, patch: cambio } = parsed.data

  try {
    const resultado = await withUser(user.id, async (tx) => {
      const [actual] = await tx
        .select()
        .from(movement)
        .where(
          and(
            eq(movement.id, movementId),
            eq(movement.userId, user.id),
            inArray(movement.kind, EDITABLE_KINDS),
          ),
        )
      if (!actual) return failure("Ese movimiento no existe.")

      if ("categoryId" in cambio) {
        if (cambio.categoryId === actual.categoryId) return success()
        if (await isCategoryArchived(tx, user.id, cambio.categoryId)) return categoryArchived()
        if (await categoryHasChildren(tx, user.id, cambio.categoryId)) return categoryNotLeaf()
        const [cat] = await tx
          .select({ kind: category.kind })
          .from(category)
          .where(and(eq(category.id, cambio.categoryId), eq(category.userId, user.id)))
        if (!cat || cat.kind !== actual.kind) return failure("Esa categoría no existe.")

        await tx
          .update(movement)
          .set({ categoryId: cambio.categoryId, updatedAt: new Date() })
          .where(and(eq(movement.id, movementId), eq(movement.userId, user.id)))
        return success()
      }

      const cuotas = await tx
        .select({ amountCents: installment.amountCents, dueDate: installment.dueDate })
        .from(installment)
        .where(and(eq(installment.movementId, movementId), eq(installment.userId, user.id)))
      if (cuotas.length !== 1) return failure(VARIAS_CUOTAS)
      if (!actual.categoryId) return failure("Elegí una categoría primero.")

      const [cuota] = cuotas
      const date = "date" in cambio ? cambio.date : actual.date
      const amountCents = "amountCents" in cambio ? cambio.amountCents : actual.amountCents
      if (date === actual.date && amountCents === actual.amountCents) return success()

      // La cuota se mueve con la fecha: conserva la distancia al vencimiento
      // (cero en lo cargado como pagado en el momento).
      const dueDate =
        "date" in cambio ? addDaysIso(cuota.dueDate, diffDaysIso(date, actual.date)) : cuota.dueDate

      const input: MovementInput = {
        kind: assertInstallmentMovementKind(actual.kind),
        description: actual.description,
        categoryId: actual.categoryId,
        date,
        currency: assertCurrency(actual.currency),
        amountCents,
        rate: Number(actual.rate),
        installments: [{ amountCents, dueDate }],
      }
      return applyMovementUpdate(tx, user.id, movementId, input, actual.creditCardId)
    })
    if (!resultado.ok) return resultado
  } catch (error) {
    logDbError("patchMovement", error)
    if (isCheckViolation(error, "movement_category_is_leaf")) return categoryNotLeaf()
    if (isCheckViolation(error, "installment_matches_statement")) return failure(RESUMEN_CAMBIO)
    return failure("No pudimos guardar el cambio. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
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
    const result = await withUser(user.id, async (tx) => {
      // Una cuota de tarjeta pagada implica un resumen pagado (trigger
      // `installment_matches_statement`). Borrar la compra alteraría en silencio
      // el total de un resumen cerrado y ya pagado.
      const [paidStatementInstallment] = await tx
        .select({ id: installment.id })
        .from(installment)
        .where(
          and(
            eq(installment.movementId, parsed.data),
            eq(installment.userId, user.id),
            eq(installment.paid, true),
          ),
        )
        .limit(1)

      // Solo bloqueamos cuando la cuota paga pertenece a un resumen de tarjeta:
      // en efectivo/débito borrar un movimiento pagado sigue estando permitido.
      if (paidStatementInstallment) {
        const [onCard] = await tx
          .select({ creditCardId: movement.creditCardId })
          .from(movement)
          .where(and(eq(movement.id, parsed.data), eq(movement.userId, user.id)))
          .limit(1)
        if (onCard?.creditCardId !== null && onCard?.creditCardId !== undefined) {
          return failure(
            "Tiene cuotas en un resumen de tarjeta ya pagado: desmarcalo antes de borrar la compra.",
          )
        }
      }

      // Las cuotas caen solas por el ON DELETE CASCADE.
      const deleted = await tx
        .delete(movement)
        .where(and(eq(movement.id, parsed.data), eq(movement.userId, user.id)))
        .returning({ id: movement.id })
      if (deleted.length === 0) return failure("Ese movimiento no existe.")
      return success()
    })
    if (!result.ok) return result
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
    const result = await withUser(user.id, async (tx) => {
      // Una cuota de una compra con tarjeta no se paga sola: se paga cuando
      // se paga su resumen (§1.3 del plan v2). La base lo rechazaría igual
      // (trigger `installment_matches_statement`); esto es para decirlo claro.
      const [cuota] = await tx
        .select({ statementId: installment.statementId })
        .from(installment)
        .where(and(eq(installment.id, parsed.data.id), eq(installment.userId, user.id)))
      if (!cuota) return failure("No encontramos esa cuota.")
      if (cuota.statementId !== null) {
        return failure("Esta cuota es de una compra con tarjeta: se paga con el resumen.")
      }

      await tx
        .update(installment)
        .set({ paid: parsed.data.paid, paidDate: resolved.paidDate })
        .where(and(eq(installment.id, parsed.data.id), eq(installment.userId, user.id)))
      return success()
    })

    if (!result.ok) return result
  } catch (error) {
    logDbError("setInstallmentPaid", error)
    return failure("No pudimos actualizar la cuota.")
  }

  revalidatePath("/", "layout")
  return success()
}

const fetchPageDateSchema = z
  .string()
  .refine((v) => v === "" || isValidIsoDate(v), "Fecha inválida.")

const fetchMovementListPageSchema = z.object({
  kind: z.enum(["income", "expense"]),
  page: z.number().int().min(1).max(10_000),
  query: z.object({
    search: z.string().max(SEARCH_MAX),
    categoryIds: z.array(z.string().min(1).max(100)).max(100),
    cardId: z.string().min(1).max(100),
    currency: z.enum(["all", ...CURRENCY_VALUES]),
    status: z.enum(["all", ...STATUS_VALUES]),
    from: fetchPageDateSchema,
    to: fetchPageDateSchema,
    dateField: z.enum(["date", "paid"]),
    minCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    maxCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    sort: z.enum(SORT_VALUES),
    dir: z.enum(DIR_VALUES),
    page: z.number().int().min(1).max(10_000),
  }),
})

/**
 * Trae la página siguiente para el botón "Cargar más" en móvil (§5.3),
 * manteniendo los mismos filtros, estado y orden de la URL.
 */
export async function fetchMovementListPage(
  kind: "income" | "expense",
  query: MovementQuery,
  page: number,
): Promise<{ items: MovementWithInstallments[]; page: number; totalPages: number; totalCount: number }> {
  const user = await requireUser()
  const parsed = fetchMovementListPageSchema.safeParse({ kind, query, page })
  if (!parsed.success) {
    return { items: [], page: 1, totalPages: 1, totalCount: 0 }
  }

  const today = todayInAr()
  const view = await queryMovementsView(
    user.id,
    parsed.data.kind,
    { ...parsed.data.query, page: parsed.data.page },
    today,
  )
  return {
    items: view.items,
    page: view.page,
    totalPages: view.totalPages,
    totalCount: view.totalCount,
  }
}
