-- Tipo de cambio sólo en compras y ventas de dólares.
-- Atención: el UPDATE sobre `movement.rate` es irreversible. Hacer un `pg_dump`
-- antes de aplicar esta migración en producción.

-- 1. `movement.rate`: nullable y presente si y sólo si `kind = 'exchange'`.
ALTER TABLE "movement" DROP CONSTRAINT "movement_rate_positive";--> statement-breakpoint
ALTER TABLE "movement" ALTER COLUMN "rate" DROP NOT NULL;--> statement-breakpoint
UPDATE "movement" SET "rate" = NULL WHERE "kind" <> 'exchange';--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_rate_only_exchange" CHECK (("kind" = 'exchange' AND "rate" IS NOT NULL AND "rate" > 0) OR ("kind" <> 'exchange' AND "rate" IS NULL));--> statement-breakpoint

-- 2. `card_statement`: reemplazar `usd_paid_rate` por el total en pesos `usd_paid_ars_cents`.
ALTER TABLE "card_statement" ADD COLUMN "usd_paid_ars_cents" bigint;--> statement-breakpoint
UPDATE "card_statement" cs
SET "usd_paid_ars_cents" = NULLIF((
  SELECT round(coalesce(sum(i."amount_cents"), 0)::numeric * cs."usd_paid_rate")::bigint
  FROM "installment" i
  JOIN "movement" m ON m."id" = i."movement_id"
  WHERE i."statement_id" = cs."id" AND m."currency" = 'USD'
), 0)
WHERE cs."usd_paid_rate" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "card_statement" DROP CONSTRAINT "card_statement_usd_rate_only_when_paid";--> statement-breakpoint
ALTER TABLE "card_statement" DROP COLUMN "usd_paid_rate";--> statement-breakpoint
ALTER TABLE "card_statement" ADD CONSTRAINT "card_statement_usd_paid_ars_only_when_paid" CHECK ("usd_paid_ars_cents" IS NULL OR ("paid_date" IS NOT NULL AND "usd_paid_ars_cents" > 0));--> statement-breakpoint

-- 3. `user_settings`: última cotización oficial y baja de `initial_balance_usd_rate`.
ALTER TABLE "user_settings" ADD COLUMN "last_official_buy" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "last_official_sell" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "last_official_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "initial_balance_usd_rate";
