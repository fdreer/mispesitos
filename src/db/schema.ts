import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
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
  /**
   * Pesos por dólar al que se compraron los dólares del saldo inicial. Sin este
   * costo la posición en dólares arrancaría en cero mientras el saldo inicial
   * muestra dólares, y /cambios reportaría una sobreventa que no existe.
   */
  initialBalanceUsdRate: numeric("initial_balance_usd_rate", { precision: 12, scale: 4 })
    .notNull()
    .default("0"),
  initialBalanceDate: date("initial_balance_date").notNull(),
  /** "oficial" | "blue" | "mep" */
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
    /** "income" | "expense" */
    kind: text("kind").notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    // Único sólo entre las activas: permite archivar "Ocio" y volver a crearla.
    uniqueIndex("category_active_unique")
      .on(t.userId, t.name, t.kind)
      .where(sql`archived = false`),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("movement_user_date_idx").on(t.userId, t.date),
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
    paidDate: date("paid_date"),
  },
  (t) => [
    index("installment_user_due_idx").on(t.userId, t.dueDate),
    index("installment_movement_idx").on(t.movementId),
    // Ver el comentario de la FK compuesta de `movement`. Misma razón.
    foreignKey({
      columns: [t.userId, t.movementId],
      foreignColumns: [movement.userId, movement.id],
      name: "installment_user_id_movement_id_movement_user_id_id_fk",
    }).onDelete("cascade"),
  ],
)
