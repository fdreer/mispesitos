import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
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
  ],
)

export const movement = pgTable(
  "movement",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** "income" | "expense" | "exchange" */
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    /** Obligatorio salvo en exchange, donde siempre es null. */
    categoryId: text("category_id").references(() => category.id, {
      onDelete: "restrict",
    }),
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
  (t) => [index("movement_user_date_idx").on(t.userId, t.date)],
)

export const installment = pgTable(
  "installment",
  {
    id: text("id").primaryKey(),
    movementId: text("movement_id")
      .notNull()
      .references(() => movement.id, { onDelete: "cascade" }),
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
  ],
)
