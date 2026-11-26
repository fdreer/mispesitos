import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { user } from "@/db/auth-schema"

export * from "@/db/auth-schema"

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  initialBalanceArsCents: bigint("initial_balance_ars_cents", { mode: "number" })
    .notNull()
    .default(0),
  initialBalanceUsdCents: bigint("initial_balance_usd_cents", { mode: "number" })
    .notNull()
    .default(0),
  initialBalanceUsdRate: numeric("initial_balance_usd_rate", { precision: 12, scale: 4 })
    .notNull()
    .default("0"),
  initialBalanceDate: date("initial_balance_date").notNull(),
  preferredRate: text("preferred_rate").notNull().default("blue"),
})

export const category = pgTable(
  "category",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    archived: boolean("archived").notNull().default(false),
    parentId: text("parent_id"),
    color: text("color"),
    icon: text("icon"),
  },
  (t) => [
    uniqueIndex("category_active_unique")
      .on(t.userId, t.kind, sql`coalesce(${t.parentId}, '')`, t.name)
      .where(sql`archived = false`),
    index("category_parent_idx").on(t.parentId),
    /**
     * El padre tiene que ser del mismo usuario y del mismo tipo. Mismo patrón
     * que la FK de `movement` (migraciones 0006 y 0008): la FK la evalúa el
     * dueño de la tabla, que ve TODAS las filas, así que una FK sobre
     * `parent_id` sola dejaría colgar una categoría de la de otro usuario.
     * MATCH SIMPLE: con `parent_id` nulo no exige nada.
     *
     * NO ACTION, ni CASCADE ni RESTRICT. No CASCADE: las categorías no se
     * borran (se archivan), y si algún día se borra una, que no se lleve a
     * sus hijas en silencio. No RESTRICT: RESTRICT se chequea fila por fila,
     * en el momento, y un DELETE que se lleva al padre y a sus hijas en la
     * MISMA sentencia —la cascada desde `user` al borrar una cuenta, o la
     * limpieza de los tests— podía fallar según el orden en que Postgres
     * recorriera las filas. NO ACTION protege lo mismo pero mira al final de
     * la sentencia, cuando las hijas ya no están.
     */
    foreignKey({
      columns: [t.userId, t.kind, t.parentId],
      foreignColumns: [t.userId, t.kind, t.id],
      name: "category_user_id_kind_parent_id_category_user_id_kind_id_fk",
    }).onDelete("no action"),
    check("category_not_own_parent", sql`"parent_id" IS NULL OR "parent_id" <> "id"`),
    index("category_user_idx").on(t.userId),
    // Redundante como unicidad (id ya es PK), pero es el destino obligatorio de
    // la FK compuesta de `movement`: Postgres exige que las columnas
    // referenciadas tengan una restricción única. Ver migraciones 0006 y 0008.
    //
    // `kind` entró en el juego en la 0008: al viajar dentro de la misma FK, la
    // categoría referenciada no sólo tiene que ser del mismo usuario, también
    // tiene que ser del mismo tipo que el movimiento.
    unique("category_user_id_kind_id_unique").on(t.userId, t.kind, t.id),
  ],
)

/**
 * Tarjeta de crédito (§1.2 del plan v2, Fase 3). No es una cuenta: no tiene
 * saldo propio. Es el molde del que salen los resúmenes (`card_statement`),
 * y una compra con tarjeta es un `movement` de egreso como cualquier otro que
 * además dice con qué tarjeta se hizo.
 *
 * Se archiva, no se borra, por el mismo motivo que las categorías: tiene
 * movimientos y resúmenes colgando, y borrarla se los llevaría o fallaría.
 */
export const creditCard = pgTable(
  "credit_card",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /**
     * Día de cierre y de vencimiento HABITUALES: sólo sirven para proponer
     * las fechas de un resumen nuevo. Las reales viven en cada
     * `card_statement`, porque los bancos las corren todos los meses.
     */
    closingDay: integer("closing_day").notNull(),
    dueDay: integer("due_day").notNull(),
    /** Opcional, sólo para mostrar el disponible en /tarjetas. */
    creditLimitCents: bigint("credit_limit_cents", { mode: "number" }),
    /** Clave de la misma paleta que las categorías (`@/lib/category-color`). */
    color: text("color"),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    index("credit_card_user_idx").on(t.userId),
    // Destino de las FK compuestas de `card_statement` y `movement`: mismo
    // patrón que `category_user_id_kind_id_unique` (migraciones 0006 y 0008).
    unique("credit_card_user_id_id_unique").on(t.userId, t.id),
    // Dos tarjetas activas no se llaman igual: en el selector del formulario
    // serían dos opciones indistinguibles. Archivada, el nombre se libera.
    uniqueIndex("credit_card_active_name_unique")
      .on(t.userId, t.name)
      .where(sql`archived = false`),
    check("credit_card_closing_day_range", sql`"closing_day" BETWEEN 1 AND 31`),
    check("credit_card_due_day_range", sql`"due_day" BETWEEN 1 AND 31`),
    check(
      "credit_card_limit_positive",
      sql`"credit_limit_cents" IS NULL OR "credit_limit_cents" > 0`,
    ),
  ],
)

/**
 * Un resumen por tarjeta y período (§1.2 del plan v2). Se crean a demanda: el
 * primero que necesita una compra en cuotas, o el que se abre para corregirle
 * las fechas.
 *
 * Pagar el resumen es poner `paid_date` acá y la misma fecha en todas sus
 * cuotas, en la misma transacción. Que las dos cosas coincidan no queda a
 * cargo de la Server Action: lo vigila el trigger diferido
 * `installment_matches_statement` (migración 0012).
 */
export const cardStatement = pgTable(
  "card_statement",
  {
    id: text("id").primaryKey(),
    // Duplicado a propósito, igual que en `installment`: la policy de RLS
    // aplica sin join y viaja adentro de la FK compuesta a la tarjeta.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    /** "YYYY-MM": el mes del cierre. Uno por tarjeta. */
    period: text("period").notNull(),
    /** Propuesta desde `closing_day`, editable mientras no esté pagado. */
    closingDate: date("closing_date").notNull(),
    /** Propuesta desde `due_day`; es la `due_date` de todas sus cuotas. */
    dueDate: date("due_date").notNull(),
    paidDate: date("paid_date"),
    /**
     * Si la parte en dólares se pagó con pesos, el TC al que se pagó (decisión
     * 7.1). Null si se pagó con dólares, o si no está pagado. Con TC, el saldo
     * y los informes cuentan esas cuotas como pesos y la posición en dólares
     * no las ve.
     */
    usdPaidRate: numeric("usd_paid_rate", { precision: 12, scale: 4 }),
  },
  (t) => [
    unique("card_statement_card_id_period_unique").on(t.cardId, t.period),
    // Destino de la FK compuesta de `installment`.
    unique("card_statement_user_id_id_unique").on(t.userId, t.id),
    index("card_statement_user_due_idx").on(t.userId, t.dueDate),
    /**
     * La tarjeta tiene que ser del mismo usuario: mismo agujero que cierran
     * las FK compuestas de la 0006 (las FK las evalúa el dueño de la tabla,
     * que ve todas las filas). NO ACTION y no RESTRICT por lo mismo que la FK
     * al padre de `category`: el borrado en cascada desde `user` se lleva
     * tarjeta y resúmenes en la misma sentencia.
     */
    foreignKey({
      columns: [t.userId, t.cardId],
      foreignColumns: [creditCard.userId, creditCard.id],
      name: "card_statement_user_id_card_id_credit_card_user_id_id_fk",
    }).onDelete("no action"),
    check("card_statement_period_format", sql`"period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("card_statement_due_after_closing", sql`"due_date" >= "closing_date"`),
    check(
      "card_statement_usd_rate_only_when_paid",
      sql`"usd_paid_rate" IS NULL OR ("paid_date" IS NOT NULL AND "usd_paid_rate" > 0)`,
    ),
  ],
)

export const movement = pgTable(
  "movement",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * "income" | "expense" | "exchange".
     * Viaja adentro de la FK compuesta hacia `category`: ver el comentario de
     * la FK, más abajo.
     */
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    /**
     * Obligatorio salvo en exchange, donde siempre es null. La FK NO es sobre
     * esta columna sola: es compuesta con user_id y kind, para que la base
     * impida apuntar a una categoría de otro usuario o de otro tipo. Ver
     * migraciones 0006 y 0008.
     */
    categoryId: text("category_id"),
    date: date("date").notNull(),
    /** "ARS" | "USD". En exchange siempre "USD". */
    currency: text("currency").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /** Pesos por dólar. Siempre 1 cuando currency es ARS. */
    rate: numeric("rate", { precision: 12, scale: 4 }).notNull(),
    /** "buy" | "sell". Sólo en exchange, null en el resto. */
    direction: text("direction"),
    /**
     * Medio de pago (§1.2 del plan v2): la tarjeta con la que se hizo la
     * compra, o null para efectivo/débito/transferencia, que es como se
     * comportaba todo antes de la 0012. Sólo en egresos (CHECK de abajo). FK
     * compuesta con `user_id`, como todas.
     */
    creditCardId: text("credit_card_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("movement_user_date_idx").on(t.userId, t.date),
    // Los listados siempre filtran por (user_id, kind) y ordenan/acotan por
    // fecha o importe (Fase 4 del plan v2).
    index("movement_user_kind_date_idx").on(t.userId, t.kind, t.date),
    index("movement_user_kind_amount_idx").on(t.userId, t.kind, t.amountCents),
    // Lo consultan los triggers de categoría hoja (migración 0011) y el
    // filtro por categoría de los listados.
    index("movement_category_idx").on(t.categoryId),
    // Destino de la FK compuesta de `installment`. Ver migración 0006.
    unique("movement_user_id_id_unique").on(t.userId, t.id),
    /**
     * FK compuesta, no sobre category_id sola. Lleva DOS columnas de contexto
     * adentro, cada una cerrando un agujero distinto:
     *
     * - `user_id` (migración 0006): los triggers de integridad referencial
     *   corren como dueño (BYPASSRLS) y ven TODAS las filas, así que una FK de
     *   una columna deja apuntar a categorías ajenas.
     * - `kind` (migración 0008): sin él se podía guardar un ingreso con una
     *   categoría de egresos. Desde la interfaz no pasaba porque el desplegable
     *   viene filtrado, pero el borde de confianza es la base y no el
     *   formulario; el efecto era un ingreso adentro de la torta de egresos del
     *   dashboard.
     *
     * MATCH SIMPLE (el default) no exige nada cuando alguna columna de la FK es
     * NULL: por eso los movimientos de tipo exchange siguen entrando con
     * category_id nulo, aunque su `kind` ("exchange") no sea un tipo de
     * categoría que exista.
     */
    foreignKey({
      columns: [t.userId, t.kind, t.categoryId],
      foreignColumns: [category.userId, category.kind, category.id],
      name: "movement_user_id_kind_category_id_category_user_id_kind_id_fk",
    }).onDelete("restrict"),
    // Lo consultan /tarjetas y el trigger que mira las cuotas de una compra
    // con tarjeta (migración 0012).
    index("movement_credit_card_idx").on(t.creditCardId),
    foreignKey({
      columns: [t.userId, t.creditCardId],
      foreignColumns: [creditCard.userId, creditCard.id],
      name: "movement_user_id_credit_card_id_credit_card_user_id_id_fk",
    }).onDelete("no action"),
    // Un ingreso no se cobra "con tarjeta", y un cambio de divisa tampoco.
    check(
      "movement_credit_card_only_expense",
      sql`"credit_card_id" IS NULL OR "kind" = 'expense'`,
    ),
    // Borde de confianza en la base: valores válidos de dominio e importes positivos.
    check("movement_kind_valid", sql`"kind" IN ('income', 'expense', 'exchange')`),
    check("movement_currency_valid", sql`"currency" IN ('ARS', 'USD')`),
    check("movement_amount_positive", sql`"amount_cents" > 0`),
    check("movement_rate_positive", sql`"rate" > 0`),
    check(
      "movement_direction_valid",
      sql`("kind" = 'exchange' AND "direction" IN ('buy', 'sell')) OR ("kind" <> 'exchange' AND "direction" IS NULL)`,
    ),
  ],
)

export const installment = pgTable(
  "installment",
  {
    id: text("id").primaryKey(),
    /**
     * La FK NO es sobre esta columna sola: es compuesta con user_id, para que
     * la base impida colgar una cuota de un movimiento ajeno y para que
     * installment.user_id tenga que coincidir con movement.user_id.
     */
    movementId: text("movement_id").notNull(),
    // user_id duplicado a propósito: permite que la policy de RLS aplique sin join.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    dueDate: date("due_date").notNull(),
    paid: boolean("paid").notNull().default(false),
    /**
     * Cuándo se pagó de verdad. Nula mientras la cuota esté impaga; con
     * `paid = true` es obligatoria y lo hace cumplir la CHECK de acá abajo.
     */
    paidDate: date("paid_date"),
    /**
     * El resumen en el que cae esta cuota, si el movimiento es con tarjeta
     * (§1.2 del plan v2). Obligatorio en ese caso y prohibido en el otro; la
     * `due_date` y el pago de la cuota son los del resumen. Nada de eso cabe
     * en una FK: lo hace cumplir el trigger diferido
     * `installment_matches_statement` (migración 0012).
     */
    statementId: text("statement_id"),
  },
  (t) => [
    index("installment_user_due_idx").on(t.userId, t.dueDate),
    index("installment_movement_idx").on(t.movementId),
    index("installment_statement_idx").on(t.statementId),
    foreignKey({
      columns: [t.userId, t.statementId],
      foreignColumns: [cardStatement.userId, cardStatement.id],
      name: "installment_user_id_statement_id_card_statement_user_id_id_fk",
    }).onDelete("no action"),
    /**
     * El saldo se calcula por `paid_date` (sección 5.2 del spec), así que una
     * cuota pagada sin fecha de pago no es un dato incompleto: es una fila que
     * cada pantalla interpreta distinto. `/cambios` la excluía en silencio
     * —sus consultas comparan la fecha—, `computeBalances` la contaba igual, y
     * el dashboard reventaba en `monthKey(null)`. Tres lecturas de la misma
     * fila.
     *
     * El spec lo declaraba y no lo hacía cumplir nadie: ninguna de las nueve
     * migraciones tenía una CHECK. Va acá y no en la Server Action por el
     * mismo motivo que la FK compuesta de la 0006 y la 0008: el borde de
     * confianza es la base.
     *
     * Sólo la implicación que se necesita, no la equivalencia: una cuota
     * impaga con fecha de pago colgada no rompe ninguna cuenta —todas las
     * consultas de saldo filtran por `paid = true` primero— y prohibirla sería
     * inventar una regla que el spec no pide.
     */
    check(
      "installment_paid_date_required_when_paid",
      sql`"paid" = false OR "paid_date" IS NOT NULL`,
    ),
    unique("installment_movement_id_number_unique").on(t.movementId, t.number),
    check("installment_number_positive", sql`"number" >= 1`),
    check("installment_amount_nonnegative", sql`"amount_cents" >= 0`),
    // Ver el comentario de la FK compuesta de `movement`. Misma razón.
    foreignKey({
      columns: [t.userId, t.movementId],
      foreignColumns: [movement.userId, movement.id],
      name: "installment_user_id_movement_id_movement_user_id_id_fk",
    }).onDelete("cascade"),
  ],
)

/**
 * Invitaciones para entrar a una instalación privada (§0.1 del plan v2).
 *
 * Es una tabla del lado de auth, no de datos del usuario: la consultan el alta
 * de better-auth y la pantalla del admin, siempre FUERA de withUser(), con el
 * rol de conexión `app_user`. Por eso su acceso va como el de `user` y
 * `session` (migración 0004), no por las policies `TO authenticated`.
 *
 * Del token sólo se guarda el hash: con un volcado de la base no se puede
 * armar un link válido.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    /** sha256 en hex del token que viaja en el link. */
    tokenHash: text("token_hash").notNull().unique(),
    /** Si está, sólo esa dirección puede usar la invitación. */
    email: text("email"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Se marca al reclamarla, antes de crear el usuario: un link, una cuenta. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBy: text("used_by").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("invitation_created_by_idx").on(t.createdBy)],
)
